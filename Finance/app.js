"use strict";

/* =========================================================
   PAGE CONFIGURATION AND HELPER FUNCTIONS
========================================================= */

const cfg = window.PAGE_CONFIG || {
    page: "",
    fields: [],
    actions: [],
    storageKey: ""
};

const $ = (selector, context = document) =>
    context.querySelector(selector);

const $$ = (selector, context = document) =>
    [...context.querySelectorAll(selector)];


/* =========================================================
   TOAST MESSAGE
========================================================= */

function toast(message, isError = false) {
    const toastElement = $("#toast");

    if (!toastElement) {
        return;
    }

    toastElement.textContent = message;
    toastElement.className =
        "toast show" + (isError ? " error" : "");

    clearTimeout(window.__toastTimer);

    window.__toastTimer = setTimeout(() => {
        toastElement.className = "toast";
    }, 2600);
}


/* =========================================================
   SIDEBAR NAVIGATION
   Uses event delegation so dynamically added nav groups work.
========================================================= */

document.addEventListener("click", event => {
    const navToggle = event.target.closest(".nav-toggle");

    if (!navToggle) {
        return;
    }

    const navGroup = navToggle.closest(".nav-group");

    if (!navGroup) {
        return;
    }

    const isOpen = navGroup.classList.toggle("open");

    navToggle.setAttribute(
        "aria-expanded",
        String(isOpen)
    );
});


/* =========================================================
   TABLE REFERENCES
========================================================= */

const table = $("#recordsTable");
const tbody = table?.tBodies[0] || null;

let selectedRow = null;
let editRow = null;


/* =========================================================
   TABLE ROW FUNCTIONS
========================================================= */

function rows() {
    return tbody ? [...tbody.rows] : [];
}

function selectRow(row) {
    rows().forEach(currentRow => {
        currentRow.classList.remove("selected");
    });

    selectedRow = row;

    if (selectedRow) {
        selectedRow.classList.add("selected");
    }
}

function bindRowSelection(row) {
    if (!row) {
        return;
    }

    row.addEventListener("click", () => {
        selectRow(row);
    });
}

function updateCount() {
    const recordCount = $("#recordCount");

    if (!recordCount) {
        return;
    }

    const visibleRows = rows().filter(row => !row.hidden);

    recordCount.textContent =
        `${visibleRows.length} ${
            visibleRows.length === 1 ? "record" : "records"
        }`;
}


/* =========================================================
   TABLE SEARCH AND FILTER
========================================================= */

function filterRows() {
    const tableSearchValue =
        $("#tableSearch")?.value || "";

    const globalSearchValue =
        $("#globalSearch")?.value || "";

    const searchValue =
        (tableSearchValue || globalSearchValue)
            .trim()
            .toLowerCase();

    const statusValue =
        ($("#statusFilter")?.value || "")
            .trim()
            .toLowerCase();

    rows().forEach(row => {
        const rowText =
            row.textContent.trim().toLowerCase();

        const matchesSearch =
            !searchValue ||
            rowText.includes(searchValue);

        let matchesStatus = true;

        if (statusValue) {
            const statusIndex =
                invoiceColumnIndex("Status");

            if (
                statusIndex >= 0 &&
                row.cells[statusIndex]
            ) {
                const rowStatus =
                    row.cells[statusIndex]
                        .textContent
                        .trim()
                        .toLowerCase();

                matchesStatus =
                    rowStatus === statusValue;
            } else {
                matchesStatus =
                    rowText.includes(statusValue);
            }
        }

        row.hidden =
            !(matchesSearch && matchesStatus);
    });

    updateCount();
}

$("#tableSearch")?.addEventListener(
    "input",
    filterRows
);

$("#statusFilter")?.addEventListener(
    "change",
    filterRows
);

$("#globalSearch")?.addEventListener(
    "input",
    filterRows
);


/* =========================================================
   PAGE TYPE CHECK
========================================================= */

function invoicePage() {
    return (
        cfg.page ===
        "Invoices & Outstanding Amounts"
    );
}


/* =========================================================
   TABLE COLUMN HELPERS
========================================================= */

function columnIndex(label) {
    if (!table?.tHead?.rows?.length) {
        return -1;
    }

    return [...table.tHead.rows[0].cells]
        .findIndex(cell => {
            return (
                cell.textContent.trim() === label
            );
        });
}

function invoiceColumnIndex(label) {
    return columnIndex(label);
}


/* =========================================================
   VALUE FORMATTING
========================================================= */

function formatValue(value, fieldName = "") {
    const currencyField =
        /(amount|cost|value|limit|utilized|impact|capital)/i
            .test(fieldName);

    if (!currencyField) {
        return value;
    }

    if (String(value).startsWith("₹")) {
        return value;
    }

    const cleanedValue = String(value)
        .replace(/[₹,\s]/g, "");

    const numberValue = Number(cleanedValue);

    if (Number.isNaN(numberValue)) {
        return value;
    }

    return (
        "₹" +
        numberValue.toLocaleString("en-IN")
    );
}


/* =========================================================
   RECORD DIALOG AND FORM
========================================================= */

const recordDialog = $("#recordDialog");
const recordForm = $("#recordForm");

function clearFormErrors() {
    if (!recordForm) {
        return;
    }

    $$(".field-error", recordForm)
        .forEach(error => {
            error.textContent = "";
        });

    $$("[name]", recordForm)
        .forEach(field => {
            field.classList.remove("invalid");
        });

    const formMessage = $("#formMessage");

    if (formMessage) {
        formMessage.textContent = "";
    }
}

function openForm(mode) {
    if (!recordDialog || !recordForm) {
        toast(
            "The record form is not available on this page.",
            true
        );

        return;
    }

    if (mode === "edit" && !selectedRow) {
        toast(
            "Select a record before editing.",
            true
        );

        return;
    }

    editRow =
        mode === "edit"
            ? selectedRow
            : null;

    const dialogTitle = $("#dialogTitle");

    if (dialogTitle) {
        dialogTitle.textContent =
            mode === "edit"
                ? "Edit Record"
                : "Add Record";
    }

    clearFormErrors();

    $$("[name]", recordForm)
        .forEach((field, index) => {
            if (
                editRow &&
                editRow.cells[index]
            ) {
                let value =
                    editRow.cells[index]
                        .textContent
                        .trim();

                if (
                    field.type === "number"
                ) {
                    value = value.replace(
                        /[₹,\s]/g,
                        ""
                    );
                }

                field.value = value;
            } else {
                field.value = "";
            }
        });

    recordDialog.showModal();
}


/* =========================================================
   CLOSE RECORD DIALOG
========================================================= */

$$(".close-dialog").forEach(button => {
    button.addEventListener("click", () => {
        recordDialog?.close();
        recordForm?.reset();
        clearFormErrors();
        editRow = null;
    });
});


/* =========================================================
   FORM VALIDATION
========================================================= */

function validateForm() {
    if (!recordForm) {
        return {
            valid: false,
            values: []
        };
    }

    let isValid = true;
    const values = [];

    $$("[name]", recordForm)
        .forEach(field => {
            const value =
                field.value.trim();

            const fieldError =
                field
                    .closest("label")
                    ?.querySelector(
                        ".field-error"
                    );

            const missingValue =
                field.hasAttribute("required") &&
                !value;

            field.classList.toggle(
                "invalid",
                missingValue
            );

            if (fieldError) {
                fieldError.textContent =
                    missingValue
                        ? "This field is required."
                        : "";
            }

            if (missingValue) {
                isValid = false;
            }

            values.push(value);
        });

    return {
        valid: isValid,
        values
    };
}


/* =========================================================
   ADD OR EDIT RECORD
========================================================= */

recordForm?.addEventListener(
    "submit",
    event => {
        event.preventDefault();

        if (!tbody) {
            toast(
                "The records table is unavailable.",
                true
            );

            return;
        }

        const validation =
            validateForm();

        if (!validation.valid) {
            const formMessage =
                $("#formMessage");

            if (formMessage) {
                formMessage.textContent =
                    "Correct the highlighted fields.";
            }

            return;
        }

        const values =
            validation.values;

        if (editRow) {
            values.forEach(
                (value, index) => {
                    if (
                        editRow.cells[index]
                    ) {
                        editRow.cells[index]
                            .textContent =
                            formatValue(
                                value,
                                cfg.fields[index]
                            );
                    }
                }
            );

            if (invoicePage()) {
                normalizeInvoiceRow(
                    editRow
                );
            }

            toast(
                "Record updated successfully."
            );
        } else {
            const newRow =
                tbody.insertRow();

            values.forEach(
                (value, index) => {
                    const cell =
                        newRow.insertCell();

                    cell.textContent =
                        formatValue(
                            value,
                            cfg.fields[index]
                        );
                }
            );

            if (invoicePage()) {
                const approvalIndex =
                    invoiceColumnIndex(
                        "Approval"
                    );

                if (approvalIndex >= 0) {
                    while (
                        newRow.cells.length <=
                        approvalIndex
                    ) {
                        newRow.insertCell();
                    }
                }

                normalizeInvoiceRow(newRow);
            }

            bindRowSelection(newRow);
            selectRow(newRow);

            toast(
                "New record added successfully."
            );
        }

        recordDialog?.close();
        recordForm.reset();

        clearFormErrors();
        updateCount();
        saveRows();
        filterRows();

        editRow = null;
    }
);


/* =========================================================
   DELETE SELECTED RECORD
========================================================= */

function deleteSelected() {
    if (!selectedRow) {
        toast(
            "Select a record before deleting.",
            true
        );

        return;
    }

    const confirmed = confirm(
        "Delete the selected record?"
    );

    if (!confirmed) {
        return;
    }

    selectedRow.remove();
    selectedRow = null;

    updateCount();
    saveRows();

    toast(
        "Record deleted successfully."
    );
}


/* =========================================================
   COMPARISON DIALOG
========================================================= */

function openComparison() {
    const compareDialog =
        $("#compareDialog");

    if (compareDialog) {
        compareDialog.showModal();
    } else {
        toast(
            "Comparison view is ready for this module."
        );
    }
}

$$(".close-compare").forEach(button => {
    button.addEventListener("click", () => {
        $("#compareDialog")?.close();
    });
});


/* =========================================================
   CSV EXPORT
========================================================= */

function escapeCSV(value) {
    return (
        '"' +
        String(value)
            .replaceAll('"', '""') +
        '"'
    );
}

function exportCSV() {
    if (!table?.tHead?.rows?.length) {
        toast(
            "No table is available to export.",
            true
        );

        return;
    }

    const csvLines = [];

    const headerCells =
        [...table.tHead.rows[0].cells];

    csvLines.push(
        headerCells
            .map(cell =>
                escapeCSV(
                    cell.textContent.trim()
                )
            )
            .join(",")
    );

    rows()
        .filter(row => !row.hidden)
        .forEach(row => {
            const values =
                [...row.cells].map(
                    (cell, index) => {
                        const header =
                            headerCells[index]
                                ?.textContent
                                .trim();

                        if (
                            header ===
                            "Approval"
                        ) {
                            return escapeCSV("");
                        }

                        return escapeCSV(
                            cell
                                .textContent
                                .trim()
                        );
                    }
                );

            csvLines.push(
                values.join(",")
            );
        });

    const csvContent =
        "\uFEFF" +
        csvLines.join("\n");

    const csvBlob =
        new Blob(
            [csvContent],
            {
                type:
                    "text/csv;charset=utf-8"
            }
        );

    const downloadURL =
        URL.createObjectURL(csvBlob);

    const downloadLink =
        document.createElement("a");

    downloadLink.href = downloadURL;

    downloadLink.download =
        (cfg.page || "records")
            .toLowerCase()
            .replace(
                /[^a-z0-9]+/g,
                "-"
            )
            .replace(/^-|-$/g, "") +
        ".csv";

    document.body.appendChild(
        downloadLink
    );

    downloadLink.click();
    downloadLink.remove();

    URL.revokeObjectURL(
        downloadURL
    );

    toast(
        "CSV export downloaded."
    );
}


/* =========================================================
   PAGE ACTION BUTTONS
========================================================= */

function performAction(action) {
    if (!action) {
        return;
    }

    const normalizedAction =
        action.toLowerCase();

    if (
        normalizedAction.startsWith("add") ||
        normalizedAction.startsWith(
            "generate"
        )
    ) {
        openForm("add");
        return;
    }

    if (
        normalizedAction.startsWith("edit") ||
        normalizedAction.startsWith(
            "update"
        )
    ) {
        openForm("edit");
        return;
    }

    if (
        normalizedAction.startsWith(
            "delete"
        )
    ) {
        deleteSelected();
        return;
    }

    if (
        normalizedAction.includes(
            "compare"
        ) ||
        normalizedAction.includes(
            "track"
        ) ||
        normalizedAction.includes(
            "history"
        ) ||
        normalizedAction.includes(
            "monitor"
        )
    ) {
        openComparison();
        return;
    }

    if (
        normalizedAction.includes(
            "export"
        )
    ) {
        exportCSV();
        return;
    }

    if (
        normalizedAction.includes(
            "close"
        ) ||
        normalizedAction.includes(
            "verify"
        )
    ) {
        if (!selectedRow) {
            toast(
                "Select a record first.",
                true
            );

            return;
        }

        toast(
            `${action} completed for the selected record.`
        );

        return;
    }

    if (
        normalizedAction.includes(
            "search"
        ) ||
        normalizedAction.includes(
            "filter"
        )
    ) {
        $("#tableSearch")?.focus();

        toast(
            "Use the search and filter controls above."
        );

        return;
    }

    toast(`${action} is ready.`);
}

$$("[data-action]").forEach(button => {
    button.addEventListener(
        "click",
        () => {
            performAction(
                button.dataset.action
            );
        }
    );
});

$("#exportTop")?.addEventListener(
    "click",
    exportCSV
);


/* =========================================================
   LOCAL STORAGE
========================================================= */

function saveRows() {
    if (
        !tbody ||
        !cfg.storageKey
    ) {
        return;
    }

    const storedRows =
        rows().map(row => {
            return [...row.cells].map(
                (cell, index) => {
                    const header =
                        table?.tHead
                            ?.rows[0]
                            ?.cells[index]
                            ?.textContent
                            .trim();

                    if (
                        header ===
                        "Approval"
                    ) {
                        return "";
                    }

                    return cell
                        .textContent
                        .trim();
                }
            );
        });

    localStorage.setItem(
        cfg.storageKey,
        JSON.stringify(storedRows)
    );
}

function loadRows() {
    if (
        !tbody ||
        !cfg.storageKey
    ) {
        return;
    }

    const storedData =
        localStorage.getItem(
            cfg.storageKey
        );

    if (!storedData) {
        rows().forEach(row => {
            bindRowSelection(row);

            if (invoicePage()) {
                normalizeInvoiceRow(row);
            }
        });

        updateCount();
        return;
    }

    try {
        const parsedRows =
            JSON.parse(storedData);

        if (!Array.isArray(parsedRows)) {
            return;
        }

        tbody.innerHTML = "";

        parsedRows.forEach(values => {
            if (!Array.isArray(values)) {
                return;
            }

            const row =
                tbody.insertRow();

            values.forEach(value => {
                const cell =
                    row.insertCell();

                cell.textContent = value;
            });

            if (invoicePage()) {
                normalizeInvoiceRow(row);
            }

            bindRowSelection(row);
        });

        updateCount();
    } catch (error) {
        console.error(
            "Unable to load saved records:",
            error
        );

        toast(
            "Saved records could not be loaded.",
            true
        );
    }
}


/* =========================================================
   INVOICE APPROVE / REJECT BUTTONS
========================================================= */

function createDecisionButton(type) {
    const button =
        document.createElement("button");

    button.type = "button";

    button.className =
        type === "Approved"
            ? "decision-btn approve-tick"
            : "decision-btn reject-cross";

    button.dataset.decision = type;

    button.title =
        type === "Approved"
            ? "Approve invoice"
            : "Reject invoice";

    button.setAttribute(
        "aria-label",
        button.title
    );

    button.textContent =
        type === "Approved"
            ? "✓"
            : "✕";

    return button;
}

function bindDecisionButtons(row) {
    if (
        !invoicePage() ||
        !row
    ) {
        return;
    }

    const approvalIndex =
        invoiceColumnIndex("Approval");

    if (approvalIndex < 0) {
        return;
    }

    while (
        row.cells.length <=
        approvalIndex
    ) {
        row.insertCell();
    }

    const approvalCell =
        row.cells[approvalIndex];

    approvalCell.className =
        "approval-cell";

    approvalCell.innerHTML = "";

    ["Approved", "Rejected"]
        .forEach(type => {
            const button =
                createDecisionButton(
                    type
                );

            button.addEventListener(
                "click",
                event => {
                    event.stopPropagation();

                    selectRow(row);

                    setInvoiceDecision(
                        row,
                        type
                    );
                }
            );

            approvalCell.appendChild(
                button
            );
        });

    updateDecisionState(row);
}

function updateDecisionState(row) {
    if (!row) {
        return;
    }

    const statusIndex =
        invoiceColumnIndex("Status");

    if (
        statusIndex < 0 ||
        !row.cells[statusIndex]
    ) {
        return;
    }

    const status =
        row.cells[statusIndex]
            .textContent
            .trim() || "Pending";

    row.classList.toggle(
        "approved-row",
        status === "Approved"
    );

    row.classList.toggle(
        "rejected-row",
        status === "Rejected"
    );

    row.classList.toggle(
        "pending-row",
        status === "Pending"
    );

    row
        .querySelectorAll(
            "[data-decision]"
        )
        .forEach(button => {
            const isSelected =
                button.dataset.decision ===
                status;

            button.classList.toggle(
                "selected-decision",
                isSelected
            );

            button.setAttribute(
                "aria-pressed",
                String(isSelected)
            );
        });
}

function setInvoiceDecision(
    row,
    status
) {
    const statusIndex =
        invoiceColumnIndex("Status");

    if (
        statusIndex < 0 ||
        !row.cells[statusIndex]
    ) {
        toast(
            "Status column was not found.",
            true
        );

        return;
    }

    const actionWord =
        status === "Approved"
            ? "approve"
            : "reject";

    const confirmed = confirm(
        `Are you sure you want to ${actionWord} the selected invoice?`
    );

    if (!confirmed) {
        return;
    }

    row.cells[statusIndex]
        .textContent = status;

    updateDecisionState(row);
    saveRows();
    filterRows();

    toast(
        `Invoice ${status.toLowerCase()} successfully.`
    );
}

function normalizeInvoiceRow(row) {
    if (
        !invoicePage() ||
        !row
    ) {
        return;
    }

    const statusIndex =
        invoiceColumnIndex("Status");

    const approvalIndex =
        invoiceColumnIndex("Approval");

    if (statusIndex >= 0) {
        while (
            row.cells.length <=
            statusIndex
        ) {
            row.insertCell();
        }

        const currentStatus =
            row.cells[statusIndex]
                .textContent
                .trim();

        const allowedStatuses = [
            "Pending",
            "Approved",
            "Rejected"
        ];

        if (
            !allowedStatuses.includes(
                currentStatus
            )
        ) {
            row.cells[statusIndex]
                .textContent = "Pending";
        }
    }

    if (approvalIndex >= 0) {
        while (
            row.cells.length <=
            approvalIndex
        ) {
            row.insertCell();
        }
    }

    bindDecisionButtons(row);
}


/* =========================================================
   LOAD INITIAL TABLE ROWS
========================================================= */

loadRows();


/* =========================================================
   HEADER NOTIFICATION PANEL
========================================================= */

const notificationButton =
    $("#notificationButton");

const notificationPanel =
    $("#notificationPanel");

const closeNotifications =
    $("#closeNotifications");

const markAllRead =
    $("#markAllRead");

function setNotificationPanel(isOpen) {
    if (
        !notificationButton ||
        !notificationPanel
    ) {
        return;
    }

    notificationPanel.classList.toggle(
        "open",
        isOpen
    );

    notificationPanel.setAttribute(
        "aria-hidden",
        String(!isOpen)
    );

    notificationButton.setAttribute(
        "aria-expanded",
        String(isOpen)
    );
}

notificationButton?.addEventListener(
    "click",
    event => {
        event.stopPropagation();

        if (!notificationPanel) {
            toast(
                "Notification panel is not available on this page.",
                true
            );

            return;
        }

        const isCurrentlyOpen =
            notificationPanel
                .classList
                .contains("open");

        setNotificationPanel(
            !isCurrentlyOpen
        );
    }
);

closeNotifications?.addEventListener(
    "click",
    event => {
        event.stopPropagation();
        setNotificationPanel(false);
    }
);

notificationPanel?.addEventListener(
    "click",
    event => {
        event.stopPropagation();
    }
);

document.addEventListener(
    "click",
    event => {
        if (
            event.target.closest(
                ".nav-toggle"
            )
        ) {
            return;
        }

        setNotificationPanel(false);
    }
);

document.addEventListener(
    "keydown",
    event => {
        if (event.key === "Escape") {
            setNotificationPanel(false);

            if (
                recordDialog?.open
            ) {
                recordDialog.close();
            }

            const compareDialog =
                $("#compareDialog");

            if (compareDialog?.open) {
                compareDialog.close();
            }
        }
    }
);

markAllRead?.addEventListener(
    "click",
    () => {
        if (
            !notificationPanel ||
            !notificationButton
        ) {
            return;
        }

        notificationPanel
            .querySelectorAll(
                ".notification-list article"
            )
            .forEach(notification => {
                notification.classList.add(
                    "read"
                );
            });

        const notificationBadge =
            notificationButton
                .querySelector("i");

        if (notificationBadge) {
            notificationBadge.textContent =
                "0";

            notificationBadge.classList.add(
                "zero"
            );
        }

        toast(
            "All notifications marked as read."
        );
    }
);


/* =========================================================
   LOGOUT
========================================================= */

$("#logoutButton")?.addEventListener(
    "click",
    () => {
        sessionStorage.clear();

        toast(
            "Logged out successfully."
        );

        setTimeout(() => {
            window.location.href =
                "../index.html";
        }, 500);
    }
);