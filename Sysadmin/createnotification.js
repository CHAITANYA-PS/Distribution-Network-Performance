document.addEventListener("DOMContentLoaded", function () {
    const notificationBell =
        document.getElementById("notificationBell");

    const notificationTableBody =
        document.getElementById("notificationTableBody");

    const notificationSearch =
        document.getElementById("notificationSearch");

    const globalSearch =
        document.getElementById("globalSearch");

    const typeFilter =
        document.getElementById("typeFilter");

    const statusFilter =
        document.getElementById("statusFilter");

    const dateFilter =
        document.getElementById("dateFilter");

    const mobileMenuButton =
        document.getElementById("mobileMenuButton");

    const sidebar =
        document.getElementById("sidebar");

    const markAllReadButton =
        document.getElementById("markAllReadButton");

    const preferencesForm =
        document.getElementById("preferencesForm");

    const clearReadButton =
        document.getElementById("clearReadButton");

    const exportNotificationsButton =
        document.getElementById("exportNotificationsButton");

    const logoutButton =
        document.getElementById("logoutButton");


    /* =========================================
       TOAST MESSAGE
    ========================================== */

    function showToast(message, type = "") {
        const existingToast =
            document.querySelector(".dashboard-toast");

        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement("div");

        toast.className =
            "dashboard-toast" + (type ? " " + type : "");

        toast.textContent = message;

        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");

        document.body.appendChild(toast);

        window.setTimeout(function () {
            toast.remove();
        }, 2800);
    }


    /* =========================================
       NOTIFICATION BELL NAVIGATION
    ========================================== */

    if (notificationBell) {
        notificationBell.addEventListener(
            "click",
            function () {
                window.location.href = "notifications.html";
            }
        );
    }


    /* =========================================
       MOBILE SIDEBAR
    ========================================== */

    if (mobileMenuButton && sidebar) {
        mobileMenuButton.addEventListener(
            "click",
            function () {
                sidebar.classList.toggle("mobile-open");

                const isOpen =
                    sidebar.classList.contains("mobile-open");

                mobileMenuButton.setAttribute(
                    "aria-expanded",
                    String(isOpen)
                );

                mobileMenuButton.setAttribute(
                    "aria-label",
                    isOpen
                        ? "Close navigation"
                        : "Open navigation"
                );
            }
        );
    }


    /* =========================================
       CLOSE MOBILE SIDEBAR AFTER NAVIGATION
    ========================================== */

    if (sidebar && mobileMenuButton) {
        sidebar
            .querySelectorAll("a")
            .forEach(function (link) {
                link.addEventListener("click", function () {
                    sidebar.classList.remove("mobile-open");

                    mobileMenuButton.setAttribute(
                        "aria-expanded",
                        "false"
                    );

                    mobileMenuButton.setAttribute(
                        "aria-label",
                        "Open navigation"
                    );
                });
            });
    }


    /* =========================================
       UPDATE UNREAD COUNT
    ========================================== */

    function updateUnreadCount() {
        if (!notificationTableBody) {
            return;
        }

        const unreadCount =
            notificationTableBody.querySelectorAll(
                'tr[data-status="unread"]'
            ).length;

        const notificationCount =
            document.getElementById("notificationCount");

        const unreadStat =
            document.getElementById("unreadStat");

        const heroUnreadCount =
            document.getElementById("heroUnreadCount");

        if (notificationCount) {
            notificationCount.textContent = unreadCount;
            notificationCount.hidden = unreadCount === 0;
        }

        if (unreadStat) {
            unreadStat.textContent = unreadCount;
        }

        if (heroUnreadCount) {
            heroUnreadCount.textContent =
                unreadCount +
                (unreadCount === 1
                    ? " unread notification"
                    : " unread notifications");
        }
    }


    /* =========================================
       MARK A ROW AS READ
    ========================================== */

    function setRowAsRead(row) {
        if (!row) {
            return;
        }

        row.dataset.status = "read";

        const statusCell =
            row.querySelector(".notification-status");

        if (statusCell) {
            statusCell.innerHTML = "<mark>Read</mark>";
        }

        const markReadButton =
            row.querySelector(".mark-read-btn");

        if (markReadButton) {
            markReadButton.textContent = "Read";
            markReadButton.disabled = true;
            markReadButton.classList.remove("mark-read-btn");
        }
    }


    /* =========================================
       INDIVIDUAL MARK-READ BUTTON
    ========================================== */

    if (notificationTableBody) {
        notificationTableBody.addEventListener(
            "click",
            function (event) {
                const button =
                    event.target.closest(".mark-read-btn");

                if (!button) {
                    return;
                }

                const row = button.closest("tr");

                setRowAsRead(row);
                updateUnreadCount();
                applyFilters();

                showToast(
                    "Admin notification marked as read."
                );
            }
        );
    }


    /* =========================================
       MARK ALL AS READ
    ========================================== */

    if (markAllReadButton && notificationTableBody) {
        markAllReadButton.addEventListener(
            "click",
            function () {
                const unreadRows =
                    notificationTableBody.querySelectorAll(
                        'tr[data-status="unread"]'
                    );

                if (unreadRows.length === 0) {
                    showToast(
                        "All notifications are already read.",
                        "info"
                    );

                    return;
                }

                unreadRows.forEach(function (row) {
                    setRowAsRead(row);
                });

                updateUnreadCount();
                applyFilters();

                showToast(
                    "All Admin notifications marked as read."
                );
            }
        );
    }


    /* =========================================
       FILTER NOTIFICATIONS
    ========================================== */

    function applyFilters() {
        if (!notificationTableBody) {
            return;
        }

        const searchTerm = notificationSearch
            ? notificationSearch.value.trim().toLowerCase()
            : "";

        const selectedType = typeFilter
            ? typeFilter.value
            : "all";

        const selectedStatus = statusFilter
            ? statusFilter.value
            : "all";

        const selectedDate = dateFilter
            ? dateFilter.value
            : "all";

        let visibleCount = 0;

        notificationTableBody
            .querySelectorAll("tr")
            .forEach(function (row) {
                const searchableContent =
                    (
                        (row.dataset.search || "") +
                        " " +
                        row.textContent
                    ).toLowerCase();

                const matchesSearch =
                    searchableContent.includes(searchTerm);

                const matchesType =
                    selectedType === "all" ||
                    row.dataset.type === selectedType;

                const matchesStatus =
                    selectedStatus === "all" ||
                    row.dataset.status === selectedStatus;

                let matchesDate = false;

                if (selectedDate === "all") {
                    matchesDate = true;
                } else if (selectedDate === "today") {
                    matchesDate =
                        row.dataset.date === "today";
                } else if (selectedDate === "week") {
                    matchesDate =
                        row.dataset.date === "today" ||
                        row.dataset.date === "week";
                } else if (selectedDate === "month") {
                    matchesDate =
                        row.dataset.date === "today" ||
                        row.dataset.date === "week" ||
                        row.dataset.date === "month";
                }

                const shouldDisplay =
                    matchesSearch &&
                    matchesType &&
                    matchesStatus &&
                    matchesDate;

                row.style.display =
                    shouldDisplay ? "" : "none";

                if (shouldDisplay) {
                    visibleCount += 1;
                }
            });

        const resultText =
            document.getElementById(
                "notificationResultText"
            );

        if (resultText) {
            resultText.textContent =
                visibleCount +
                (visibleCount === 1
                    ? " notification found."
                    : " notifications found.");
        }
    }


    /* =========================================
       FILTER EVENT LISTENERS
    ========================================== */

    if (notificationSearch) {
        notificationSearch.addEventListener(
            "input",
            applyFilters
        );
    }

    if (typeFilter) {
        typeFilter.addEventListener(
            "change",
            applyFilters
        );
    }

    if (statusFilter) {
        statusFilter.addEventListener(
            "change",
            applyFilters
        );
    }

    if (dateFilter) {
        dateFilter.addEventListener(
            "change",
            applyFilters
        );
    }


    /* =========================================
       GLOBAL SEARCH
    ========================================== */

    if (globalSearch && notificationSearch) {
        globalSearch.addEventListener(
            "input",
            function () {
                notificationSearch.value =
                    globalSearch.value;

                applyFilters();
            }
        );
    }


    /* =========================================
       SAVE NOTIFICATION PREFERENCES
    ========================================== */

    if (preferencesForm) {
        preferencesForm.addEventListener(
            "submit",
            function (event) {
                event.preventDefault();

                const approvalPreference =
                    document.getElementById(
                        "approvalPreference"
                    );

                const paymentPreference =
                    document.getElementById(
                        "paymentPreference"
                    );

                const riskPreference =
                    document.getElementById(
                        "riskPreference"
                    );

                const disputePreference =
                    document.getElementById(
                        "disputePreference"
                    );

                const preferences = {
                    approval: approvalPreference
                        ? approvalPreference.value
                        : "enabled",

                    payment: paymentPreference
                        ? paymentPreference.value
                        : "enabled",

                    risk: riskPreference
                        ? riskPreference.value
                        : "enabled",

                    dispute: disputePreference
                        ? disputePreference.value
                        : "enabled"
                };

                localStorage.setItem(
                    "dsphereAdminNotificationPreferences",
                    JSON.stringify(preferences)
                );

                showToast(
                    "Admin notification preferences saved."
                );
            }
        );
    }


    /* =========================================
       RESTORE SAVED PREFERENCES
    ========================================== */

    function restorePreferences() {
        try {
            const savedPreferences =
                localStorage.getItem(
                    "dsphereAdminNotificationPreferences"
                );

            if (!savedPreferences) {
                return;
            }

            const preferences =
                JSON.parse(savedPreferences);

            const approvalPreference =
                document.getElementById(
                    "approvalPreference"
                );

            const paymentPreference =
                document.getElementById(
                    "paymentPreference"
                );

            const riskPreference =
                document.getElementById(
                    "riskPreference"
                );

            const disputePreference =
                document.getElementById(
                    "disputePreference"
                );

            if (approvalPreference) {
                approvalPreference.value =
                    preferences.approval || "enabled";
            }

            if (paymentPreference) {
                paymentPreference.value =
                    preferences.payment || "enabled";
            }

            if (riskPreference) {
                riskPreference.value =
                    preferences.risk || "enabled";
            }

            if (disputePreference) {
                disputePreference.value =
                    preferences.dispute || "enabled";
            }
        } catch (error) {
            console.error(
                "Unable to restore notification preferences:",
                error
            );
        }
    }


    /* =========================================
       CLEAR READ NOTIFICATIONS
    ========================================== */

    if (clearReadButton && notificationTableBody) {
        clearReadButton.addEventListener(
            "click",
            function () {
                const readRows =
                    notificationTableBody.querySelectorAll(
                        'tr[data-status="read"]'
                    );

                if (readRows.length === 0) {
                    showToast(
                        "There are no read notifications to clear.",
                        "info"
                    );

                    return;
                }

                readRows.forEach(function (row) {
                    row.remove();
                });

                updateUnreadCount();
                applyFilters();

                showToast(
                    "Read Admin notifications cleared."
                );
            }
        );
    }


    /* =========================================
       CSV VALUE FORMATTING
    ========================================== */

    function formatCsvValue(value) {
        return (
            '"' +
            String(value).replace(/"/g, '""') +
            '"'
        );
    }


    /* =========================================
       EXPORT NOTIFICATIONS
    ========================================== */

    if (
        exportNotificationsButton &&
        notificationTableBody
    ) {
        exportNotificationsButton.addEventListener(
            "click",
            function () {
                const rows =
                    notificationTableBody.querySelectorAll(
                        "tr"
                    );

                if (rows.length === 0) {
                    showToast(
                        "There are no notifications to export.",
                        "error"
                    );

                    return;
                }

                const csvRows = [
                    [
                        "Category",
                        "Reference",
                        "Notification",
                        "Date",
                        "Status"
                    ]
                ];

                rows.forEach(function (row) {
                    const cells =
                        row.querySelectorAll("td");

                    if (cells.length < 5) {
                        return;
                    }

                    csvRows.push([
                        cells[0].textContent.trim(),
                        cells[1].textContent.trim(),
                        cells[2].textContent.trim(),
                        cells[3].textContent.trim(),
                        row.dataset.status || ""
                    ]);
                });

                const csvContent =
                    "\uFEFF" +
                    csvRows
                        .map(function (row) {
                            return row
                                .map(formatCsvValue)
                                .join(",");
                        })
                        .join("\n");

                const blob = new Blob(
                    [csvContent],
                    {
                        type: "text/csv;charset=utf-8;"
                    }
                );

                const downloadUrl =
                    URL.createObjectURL(blob);

                const downloadLink =
                    document.createElement("a");

                downloadLink.href = downloadUrl;

                downloadLink.download =
                    "dsphere-admin-notifications.csv";

                document.body.appendChild(downloadLink);

                downloadLink.click();
                downloadLink.remove();

                URL.revokeObjectURL(downloadUrl);

                showToast(
                    "Admin notification report downloaded."
                );
            }
        );
    }


    /* =========================================
       LOGOUT
    ========================================== */

    if (logoutButton) {
        logoutButton.addEventListener(
            "click",
            function () {
                sessionStorage.clear();

                showToast(
                    "Logged out successfully."
                );

                window.setTimeout(function () {
                    window.location.href =
                        "../index.html";
                }, 800);
            }
        );
    }


    /* =========================================
       INITIAL PAGE SETUP
    ========================================== */

    restorePreferences();
    updateUnreadCount();
    applyFilters();
});