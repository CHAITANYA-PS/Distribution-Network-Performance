const $ = (selector, element = document) =>
    element.querySelector(selector);

const $$ = (selector, element = document) =>
    [...element.querySelectorAll(selector)];


/* =========================================================
   INITIAL DATA
   ========================================================= */

const seed = {
    distributors: [
        {
            id: 1,
            name: "Sharma Distributors",
            region: "North",
            category: "Beverages",
            status: "Active",
            sales: 2400000,
            health: 84,
            coverage: 96
        },
        {
            id: 2,
            name: "Patel Enterprises",
            region: "West",
            category: "Snacks",
            status: "Active",
            sales: 2100000,
            health: 79,
            coverage: 91
        },
        {
            id: 3,
            name: "Kumar & Sons",
            region: "South",
            category: "Personal Care",
            status: "At Risk",
            sales: 1800000,
            health: 58,
            coverage: 74
        },
        {
            id: 4,
            name: "Verma Distribution",
            region: "East",
            category: "Home Care",
            status: "Active",
            sales: 1500000,
            health: 76,
            coverage: 89
        },
        {
            id: 5,
            name: "Global Trade Links",
            region: "West",
            category: "Beverages",
            status: "Active",
            sales: 1300000,
            health: 81,
            coverage: 93
        }
    ],

    recommendations: [
        {
            id: 1,
            type: "Retention",
            text: "Strengthen engagement with low-activity distributors",
            priority: "High",
            status: "Pending"
        },
        {
            id: 2,
            type: "Corrective Action",
            text: "Address delayed payments for identified distributors",
            priority: "High",
            status: "In Progress"
        },
        {
            id: 3,
            type: "Growth Opportunity",
            text: "Increase focus on high-potential regions",
            priority: "Medium",
            status: "Pending"
        },
        {
            id: 4,
            type: "Risk Mitigation",
            text: "Monitor declining distributor performance",
            priority: "Medium",
            status: "In Progress"
        }
    ],

    returns: [
        {
            id: 1,
            distributor: "Kumar & Sons",
            issue: "Damaged goods",
            amount: 12400,
            days: 12,
            priority: "High",
            status: "Pending"
        },
        {
            id: 2,
            distributor: "Patel Enterprises",
            issue: "Expired stock",
            amount: 16500,
            days: 7,
            priority: "High",
            status: "In Progress"
        },
        {
            id: 3,
            distributor: "Verma Distribution",
            issue: "Scheme claim",
            amount: 12000,
            days: 10,
            priority: "Medium",
            status: "Escalated"
        }
    ],

    alerts: [
        {
            id: 1,
            type: "Risk",
            text: "Kumar & Sons marked as At Risk",
            time: "Today, 10:30 AM",
            read: false
        },
        {
            id: 2,
            type: "Recovery",
            text: "High return volume detected in West Region",
            time: "Today, 09:15 AM",
            read: false
        },
        {
            id: 3,
            type: "Health",
            text: "Health score dropped for Patel Enterprises",
            time: "Yesterday, 04:20 PM",
            read: false
        },
        {
            id: 4,
            type: "Target",
            text: "Target achievement below 80% in South Region",
            time: "Yesterday, 11:30 AM",
            read: true
        },
        {
            id: 5,
            type: "Carbon",
            text: "Carbon emission limit exceeded",
            time: "Mar 12, 02:45 PM",
            read: true
        }
    ],

    targets: [
        {
            id: 1,
            name: "Monthly Revenue",
            value: 14800000,
            period: "Oct 2026"
        },
        {
            id: 2,
            name: "Distributor Coverage",
            value: 96,
            period: "Q4 2026"
        }
    ],

    activities: []
};


/* =========================================================
   APPLICATION STATE
   ========================================================= */

let state =
    JSON.parse(localStorage.getItem("dsphereData") || "null") ||
    seed;

const save = () => {
    localStorage.setItem(
        "dsphereData",
        JSON.stringify(state)
    );

    updateBadge();
};

const money = (number) =>
    "₹" +
    (
        number >= 10000000
            ? (number / 10000000).toFixed(1) + " Cr"
            : number >= 100000
                ? (number / 100000).toFixed(1) + " L"
                : number.toLocaleString("en-IN")
    );


/* =========================================================
   NAVIGATION
   ========================================================= */

const nav = [
    [
        "dashboard",
        "⌂",
        "Dashboard Overview",
        "index.html"
    ],
    [
        "network",
        "◫",
        "Distributor Network",
        "distributor-network.html"
    ],
    [
        "sales",
        "↗",
        "Sales Performance",
        "sales-performance.html"
    ],
    [
        "health",
        "♡",
        "Distributor Health",
        "distributor-health.html"
    ],
    [
        "recommendations",
        "✦",
        "Recommendation Center",
        "recommendation-center.html"
    ],
    [
        "returns",
        "↺",
        "Returns & Recovery",
        "returns-recovery.html"
    ],
    [
        "carbon",
        "♧",
        "Carbon Compliance",
        "carbon-compliance.html"
    ],
    [
        "reports",
        "▥",
        "Reports & Analytics",
        "reports-analytics.html"
    ],
    [
        "Notifications",
        "♢",
        "Notifications",
        "notifications.html"
    ]
];

const pageFiles = Object.fromEntries(
    nav.map((item) => [
        item[0],
        item[3]
    ])
);

$("#mainNav").innerHTML = nav
    .map(
        (item) => `
            <a
                class="nav-item"
                data-page="${item[0]}"
                href="${item[3]}"
            >
                <span class="nav-icon">
                    ${item[1]}
                </span>

                ${item[2]}
            </a>
        `
    )
    .join("");


/* =========================================================
   SHARED UI COMPONENTS
   ========================================================= */

const title = (
    heading,
    paragraph,
    buttons = ""
) => `
    <div class="page-head">
        <div>
            <h1>${heading}</h1>
            <p>${paragraph}</p>
        </div>

        <div class="actions">
            ${buttons}
        </div>
    </div>
`;

const pill = (value) => `
    <span class="pill ${
        /active|completed|compliant|resolved/i.test(value)
            ? "green"
            : /risk|high|escalated/i.test(value)
                ? "red"
                : /medium|pending/i.test(value)
                    ? "amber"
                    : "blue"
    }">
        ${value}
    </span>
`;

const bars = (actual, target) => `
    <div class="chart">
        ${actual
            .map(
                (value, index) => `
                    <div class="bar-wrap">
                        <i
                            class="bar"
                            style="height:${target[index]}%"
                        ></i>

                        <i
                            class="bar accent"
                            style="height:${value}%"
                        ></i>

                        <small>
                            ${
                                [
                                    "Jan",
                                    "Feb",
                                    "Mar",
                                    "Apr",
                                    "May",
                                    "Jun",
                                    "Jul",
                                    "Aug",
                                    "Sep",
                                    "Oct",
                                    "Nov",
                                    "Dec"
                                ][index]
                            }
                        </small>
                    </div>
                `
            )
            .join("")}
    </div>

    <div class="legend">
        <span>
            <i style="background:#ccd5df"></i>
            Target
        </span>

        <span>
            <i style="background:#8B5A2B"></i>
            Actual
        </span>
    </div>
`;

const kpis = (items) => `
    <div class="grid kpi-grid">
        ${items
            .map(
                (item) => `
                    <article class="card kpi">
                        <span class="kpi-icon">
                            ${item[3]}
                        </span>

                        <div class="label">
                            ${item[0]}
                        </div>

                        <div class="value">
                            ${item[1]}
                        </div>

                        <small class="trend ${
                            item[2].includes("-")
                                ? "down"
                                : "up"
                        }">
                            ${item[2]}
                        </small>
                    </article>
                `
            )
            .join("")}
    </div>
`;


/* =========================================================
   DASHBOARD PAGE
   ========================================================= */

function dashboard() {
    return (
        title(
            "Dashboard Overview",
            "A consolidated view of distributor performance and operational priorities.",
            `
                <button
                    class="btn"
                    data-action="export"
                >
                    Export summary
                </button>

                <button
                    class="btn primary"
                    data-action="target"
                >
                    Set target
                </button>
            `
        ) +
        kpis([
            [
                "Total Sales",
                "₹12.4M",
                "↑ 12.5%",
                "₹"
            ],
            [
                "Target Achievement",
                "92%",
                "↑ 5.2%",
                "◎"
            ],
            [
                "Active Distributors",
                state.distributors.filter(
                    (distributor) =>
                        distributor.status === "Active"
                ).length,
                "↑ 3.1%",
                "♧"
            ],
            [
                "At-Risk Distributors",
                state.distributors.filter(
                    (distributor) =>
                        distributor.status === "At Risk"
                ).length,
                "-10%",
                "△"
            ]
        ]) +
        `
            <div class="grid two-col">
                <article class="card">
                    <h2>Monthly Sales Performance</h2>

                    ${bars(
                        [
                            28, 35, 42, 38, 49, 54,
                            58, 64, 57, 71, 68, 82
                        ],
                        [
                            34, 39, 45, 48, 52, 58,
                            62, 67, 70, 74, 78, 84
                        ]
                    )}
                </article>

                <article class="card">
                    <h2>Quick Insights</h2>

                    <div class="insight-list">
                        <div class="insight">
                            ✓

                            <div>
                                <b>Sales up by 12.5%</b>
                                <small>
                                    Compared with last quarter
                                </small>
                            </div>
                        </div>

                        <div class="insight">
                            ✓

                            <div>
                                <b>
                                    4 distributors moved out of risk
                                </b>

                                <small>
                                    Health interventions are working
                                </small>
                            </div>
                        </div>

                        <div class="insight">
                            ⓘ

                            <div>
                                <b>West region leads growth</b>

                                <small>
                                    18% quarter-on-quarter increase
                                </small>
                            </div>
                        </div>
                    </div>
                </article>

                <article class="card">
                    <h2>Sales Manager Actions</h2>

                    <div class="quick-actions">
                        <button
                            class="btn"
                            data-action="target"
                        >
                            Set Monthly Targets
                        </button>

                        <button
                            class="btn"
                            data-go="recommendations"
                        >
                            Review Recommendations
                        </button>

                        <button
                            class="btn"
                            data-go="returns"
                        >
                            Review Recovery Cases
                        </button>

                        <button
                            class="btn"
                            data-go="reports"
                        >
                            Open Analytics
                        </button>
                    </div>
                </article>

                <article class="card">
                    <h2>Distributor Performance</h2>

                    ${[
                        ["Top Performers", 82],
                        ["On Track", 67],
                        ["Needs Support", 24]
                    ]
                        .map(
                            (item) => `
                                <div class="metric-row">
                                    <span>${item[0]}</span>

                                    <div style="width:55%">
                                        <div class="progress">
                                            <span
                                                style="width:${item[1]}%"
                                            ></span>
                                        </div>
                                    </div>

                                    <b>${item[1]}%</b>
                                </div>
                            `
                        )
                        .join("")}
                </article>
            </div>
        `
    );
}


/* =========================================================
   DISTRIBUTOR NETWORK PAGE
   ========================================================= */

function network() {
    return (
        title(
            "Distributor Network",
            "Manage distributor coverage, profiles, regions, and onboarding.",
            `
                <button
                    class="btn primary"
                    data-action="addDistributor"
                >
                    Add distributor
                </button>
            `
        ) +
        kpis([
            [
                "Total Distributors",
                state.distributors.length,
                "↑ 3.1%",
                "◫"
            ],
            [
                "North",
                state.distributors.filter(
                    (item) => item.region === "North"
                ).length,
                "Coverage",
                "N"
            ],
            [
                "South",
                state.distributors.filter(
                    (item) => item.region === "South"
                ).length,
                "Coverage",
                "S"
            ],
            [
                "Average Coverage",
                Math.round(
                    state.distributors.reduce(
                        (total, distributor) =>
                            total + distributor.coverage,
                        0
                    ) / state.distributors.length
                ) + "%",
                "↑ 2%",
                "◎"
            ]
        ]) +
        `
            <div class="grid two-col">
                <article class="card">
                    <h2>India Coverage Map</h2>

                    <div class="map-placeholder">
                        INDIA DISTRIBUTOR COVERAGE
                        <br>

                        <small>
                            Interactive region summary
                        </small>
                    </div>
                </article>

                <article class="card">
                    <h2>Distributor Directory</h2>

                    <div class="toolbar">
                        <input
                            class="table-search"
                            placeholder="Search distributor..."
                        >

                        <select class="table-filter">
                            <option>All Regions</option>
                            <option>North</option>
                            <option>South</option>
                            <option>East</option>
                            <option>West</option>
                        </select>
                    </div>

                    <div class="table-wrap">
                        ${distributorTable()}
                    </div>
                </article>
            </div>
        `
    );
}

function distributorTable(
    list = state.distributors
) {
    return `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Region</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>

            <tbody>
                ${
                    list
                        .map(
                            (distributor) => `
                                <tr>
                                    <td>
                                        <b>
                                            ${distributor.name}
                                        </b>
                                    </td>

                                    <td>
                                        ${distributor.region}
                                    </td>

                                    <td>
                                        ${distributor.category}
                                    </td>

                                    <td>
                                        ${pill(
                                            distributor.status
                                        )}
                                    </td>

                                    <td>
                                        <button
                                            class="btn"
                                            data-action="viewDistributor"
                                            data-id="${distributor.id}"
                                        >
                                            View
                                        </button>

                                        <button
                                            class="btn danger"
                                            data-action="deleteDistributor"
                                            data-id="${distributor.id}"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            `
                        )
                        .join("") ||
                    `
                        <tr>
                            <td
                                colspan="5"
                                class="empty"
                            >
                                No matching distributors
                            </td>
                        </tr>
                    `
                }
            </tbody>
        </table>
    `;
}


/* =========================================================
   SALES PERFORMANCE PAGE
   ========================================================= */

function sales() {
    return (
        title(
            "Sales Performance",
            "Track targets, sell-in versus stock-sell performance, and category movement.",
            `
                <button
                    class="btn primary"
                    data-action="target"
                >
                    Enter / Adjust Forecast
                </button>
            `
        ) +
        kpis([
            ["Sales YTD", "₹12.4M", "↑ 12.5%", "₹"],
            ["Target Achievement", "92%", "↑ 5.2%", "◎"],
            ["Top Region", "West", "↑ 18%", "↗"],
            ["Forecast", "₹14.8M", "↑ 16%", "▥"]
        ]) +
        `
            <div class="grid two-col">
                <article class="card">
                    <h2>Target vs Actual</h2>

                    ${bars(
                        [
                            25, 33, 39, 47, 45, 56,
                            62, 70, 66, 78, 73, 88
                        ],
                        [
                            28, 34, 41, 48, 53, 58,
                            63, 69, 74, 79, 83, 90
                        ]
                    )}
                </article>

                <article class="card">
                    <h2>Top Performers</h2>

                    <div class="table-wrap">
                        ${distributorTable(
                            [...state.distributors]
                                .sort(
                                    (first, second) =>
                                        second.sales - first.sales
                                )
                                .slice(0, 4)
                        )}
                    </div>
                </article>

                <article class="card">
                    <h2>Category Performance</h2>

                    <div
                        class="donut"
                        data-label="₹12.4M\\A Total"
                    ></div>
                </article>

                <article class="card">
                    <h2>Product Movement Trends</h2>

                    ${[
                        "Beverages 18",
                        "Snacks 12",
                        "Personal Care 8",
                        "Home Care 15"
                    ]
                        .map((item) => {
                            const parts = item.split(" ");
                            const value = parts.pop();
                            const name = parts.join(" ");

                            return `
                                <div class="metric-row">
                                    <span>${name}</span>

                                    <b class="trend up">
                                        ↑ ${value}%
                                    </b>
                                </div>
                            `;
                        })
                        .join("")}
                </article>
            </div>
        `
    );
}


/* =========================================================
   HEALTH PAGE
   ========================================================= */

function health() {
    const averageHealth = Math.round(
        state.distributors.reduce(
            (total, distributor) =>
                total + distributor.health,
            0
        ) / state.distributors.length
    );

    return (
        title(
            "Distributor Health",
            "Monitor performance, payment discipline, order frequency, and continuity risk.",
            `
                <button
                    class="btn primary"
                    data-action="assessment"
                >
                    Update assessment
                </button>
            `
        ) +
        kpis([
            [
                "Health Score",
                averageHealth + "/100",
                "Good",
                "♡"
            ],
            [
                "Target Fulfilment",
                "92%",
                "↑ 4%",
                "◎"
            ],
            [
                "Scheme Participation",
                "88%",
                "↑ 3%",
                "▣"
            ],
            [
                "Market Expansion",
                "76%",
                "↑ 6%",
                "↗"
            ]
        ]) +
        `
            <div class="grid two-col">
                <article class="card">
                    <h2>Distributor Health Register</h2>

                    <div class="table-wrap">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Distributor</th>
                                    <th>Score</th>
                                    <th>Health</th>
                                    <th>Coverage</th>
                                    <th>Action</th>
                                </tr>
                            </thead>

                            <tbody>
                                ${state.distributors
                                    .map(
                                        (distributor) => `
                                            <tr>
                                                <td>
                                                    ${distributor.name}
                                                </td>

                                                <td>
                                                    <b>
                                                        ${distributor.health}
                                                    </b>
                                                </td>

                                                <td>
                                                    ${pill(
                                                        distributor.health >= 75
                                                            ? "Healthy"
                                                            : distributor.health >= 60
                                                                ? "Monitor"
                                                                : "At Risk"
                                                    )}
                                                </td>

                                                <td>
                                                    ${distributor.coverage}%
                                                </td>

                                                <td>
                                                    <button
                                                        class="btn"
                                                        data-action="viewDistributor"
                                                        data-id="${distributor.id}"
                                                    >
                                                        Assess
                                                    </button>
                                                </td>
                                            </tr>
                                        `
                                    )
                                    .join("")}
                            </tbody>
                        </table>
                    </div>
                </article>

                <article class="card">
                    <h2>Priority Actions</h2>

                    <div class="insight-list">
                        <div class="insight">
                            1

                            <div>
                                <b>Increase engagement</b>
                                <small>
                                    For distributors with health below 65
                                </small>
                            </div>
                        </div>

                        <div class="insight">
                            2

                            <div>
                                <b>Review pending payments</b>
                                <small>
                                    Reduce continuity risk
                                </small>
                            </div>
                        </div>

                        <div class="insight">
                            3

                            <div>
                                <b>Plan field visits</b>
                                <small>
                                    Prioritize at-risk accounts
                                </small>
                            </div>
                        </div>
                    </div>
                </article>
            </div>
        `
    );
}


/* =========================================================
   RECOMMENDATIONS PAGE
   ========================================================= */

function recommendations() {
    return (
        title(
            "Recommendation Center",
            "Convert business insights into trackable growth and corrective actions.",
            `
                <button
                    class="btn primary"
                    data-action="addRecommendation"
                >
                    Add recommendation
                </button>
            `
        ) +
        `
            <article class="card">
                <div class="tabs">
                    <button class="tab active">
                        All Recommendations
                    </button>

                    <button class="tab">
                        Retention
                    </button>

                    <button class="tab">
                        Corrective Action
                    </button>

                    <button class="tab">
                        Growth Opportunity
                    </button>

                    <button class="tab">
                        Risk Mitigation
                    </button>
                </div>

                <div class="table-wrap">
                    <table      <th>Type</th>
                                <th>Recommendation</th>
                                <th>Priority</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>

                        <tbody>
                            ${state.recommendations
                                .map(
                                    (recommendation) => `
                                        <tr>
                                            <td>
                                                <b>
                                                    ${recommendation.type}
                                                </b>
                                            </td>

                                            <td>
                                                ${recommendation.text}
                                            </td>

                                            <td>
                                                ${pill(
                                                    recommendation.priority
                                                )}
                                            </td>

                                            <td>
                                                ${pill(
                                                    recommendation.status
                                                )}
                                            </td>

                                            <td>
                                                <button
                                                    class="btn"
                                                    data-action="advanceRecommendation"
                                                    data-id="${recommendation.id}"
                                                >
                                                    ${
                                                        recommendation.status ===
                                                        "Completed"
                                                            ? "Reopen"
                                                            : "Advance"
                                                    }
                                                </button>
                                            </td>
                                        </tr>
                                    `
                                )
                                .join("")}
                        </tbody>
                    </table>
                </div>
            </article>
        `
    );
}


/* =========================================================
   RETURNS PAGE
   ========================================================= */

function returnsPage() {
    return (
        title(
            "Returns & Recovery",
            "Monitor claims, resolution status, financial recovery, and escalations.",
            `
                <button
                    class="btn primary"
                    data-action="addReturn"
                >
                    Log return case
                </button>
            `
        ) +
        kpis([
            ["Recovered", "₹320K", "↑ 22%", "₹"],
            ["Recovery Rate", "76%", "↑ 12%", "◎"],
            [
                "Pending Recovery",
                money(
                    state.returns
                        .filter(
                            (item) =>
                                item.status !== "Resolved"
                        )
                        .reduce(
                            (total, item) =>
                                total + item.amount,
                            0
                        )
                ),
                "Requires action",
                "△"
            ],
            [
                "Open Cases",
                state.returns.filter(
                    (item) =>
                        item.status !== "Resolved"
                ).length,
                "Active",
                "↺"
            ]
        ]) +
        `
            <article class="card">
                <h2>Pending Recovery Alerts</h2>

                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Distributor</th>
                                <th>Issue</th>
                                <th>Amount</th>
                                <th>Days</th>
                                <th>Priority</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>

                        <tbody>
                            ${state.returns
                                .map(
                                    (returnCase) => `
                                        <tr>
                                            <td>
                                                ${returnCase.distributor}
                                            </td>

                                            <td>
                                                ${returnCase.issue}
                                            </td>

                                            <td>
                                                ${money(returnCase.amount)}
                                            </td>

                                            <td>
                                                ${returnCase.days}
                                            </td>

                                            <td>
                                                ${pill(
                                                    returnCase.priority
                                                )}
                                            </td>

                                            <td>
                                                ${pill(
                                                    returnCase.status
                                                )}
                                            </td>

                                            <td>
                                                <button
                                                    class="btn"
                                                    data-action="resolveReturn"
                                                    data-id="${returnCase.id}"
                                                >
                                                    ${
                                                        returnCase.status ===
                                                        "Resolved"
                                                            ? "Reopen"
                                                            : "Resolve"
                                                    }
                                                </button>
                                            </td>
                                        </tr>
                                    `
                                )
                                .join("")}
                        </tbody>
                    </table>
                </div>
            </article>
        `
    );
}


/* =========================================================
   CARBON PAGE
   ========================================================= */

function carbon() {
    return (
        title(
            "Carbon Compliance",
            "Track emissions, sustainability score, compliance, and reduction initiatives.",
            `
                <button
                    class="btn"
                    data-action="export"
                >
                    Export compliance report
                </button>
            `
        ) +
        kpis([
            [
                "Total Emissions",
                "1,245 tCO₂e",
                "↓ 12%",
                "♧"
            ],
            [
                "Sustainability Score",
                "86/100",
                "↑ 6%",
                "◎"
            ],
            [
                "Compliance Status",
                "Compliant",
                "Current",
                "✓"
            ],
            [
                "High Emission Alerts",
                "3",
                "-50%",
                "△"
            ]
        ]) +
        `
            <div class="grid two-col">
                <article class="card">
                    <h2>Carbon Emission Trend</h2>

                    ${bars(
                        [
                            88, 83, 76, 69, 63, 58,
                            54, 51, 47, 44, 42, 39
                        ],
                        [
                            90, 88, 84, 80, 75, 71,
                            68, 63, 60, 56, 52, 48
                        ]
                    )}
                </article>

                <article class="card">
                    <h2>Compliance Initiatives</h2>

                    <div class="insight-list">
                        <div class="insight">
                            ✓

                            <div>
                                <b>Optimize transport routes</b>
                                <small>
                                    In progress across all regions
                                </small>
                            </div>
                        </div>

                        <div class="insight">
                            ✓

                            <div>
                                <b>
                                    Switch to eco-friendly packaging
                                </b>

                                <small>
                                    72% adoption
                                </small>
                            </div>
                        </div>

                        <div class="insight">
                            ✓

                            <div>
                                <b>Improve waste management</b>
                                <small>
                                    Quarterly audit scheduled
                                </small>
                            </div>
                        </div>
                    </div>
                </article>
            </div>
        `
    );
}


/* =========================================================
   REPORTS PAGE
   ========================================================= */

function reports() {
    return (
        title(
            "Reports & Analytics",
            "Filter performance data and export decision-ready summaries.",
            `
                <button
                    class="btn primary"
                    data-action="export"
                >
                    Export CSV
                </button>
            `
        ) +
        `
            <div class="grid two-col">
                <article class="card">
                    <h2>Filters</h2>

                    <div class="form-grid">
                        <div class="field">
                            <label>Region</label>

                            <select id="reportRegion">
                                <option>All Regions</option>
                                <option>North</option>
                                <option>South</option>
                                <option>East</option>
                                <option>West</option>
                            </select>
                        </div>

                        <div class="field">
                            <label>Category</label>

                            <select id="reportCategory">
                                <option>All Categories</option>
                                <option>Beverages</option>
                                <option>Snacks</option>
                                <option>Personal Care</option>
                                <option>Home Care</option>
                            </select>
                        </div>

                        <div class="field full">
                            <button
                                class="btn primary"
                                data-action="applyReport"
                            >
                                Apply filters
                            </button>
                        </div>
                    </div>
                </article>

                <article class="card">
                    <h2>Key Reports</h2>

                    <div class="quick-actions">
                        <button
                            class="btn"
                            data-action="export"
                        >
                            Sales Performance
                        </button>

                        <button
                            class="btn"
                            data-action="export"
                        >
                            Distributor Health
                        </button>

                        <button
                            class="btn"
                            data-action="export"
                        >
                            Returns & Recovery
                        </button>

                        <button
                            class="btn"
                            data-action="export"
                        >
                            Carbon Compliance
                        </button>
                    </div>
                </article>
            </div>

            <article
                class="card"
                style="margin-top:16px"
            >
                <h2>Analytics Dataset</h2>

                <div
                    id="reportTable"
                    class="table-wrap"
                >
                    ${distributorTable()}
                </div>
            </article>
        `
    );
}


/* =========================================================
   ALERTS PAGE
   ========================================================= */

function alerts() {
    return (
        title(
            "Alerts & Notifications",
            "Review operational exceptions by type and keep follow-ups visible.",
            `
                <button
                    class="btn"
                    data-action="markAllRead"
                >
                    Mark all read
                </button>
            `
        ) +
        kpis([
            [
                "Total Alerts",
                state.alerts.length,
                "Current",
                "♢"
            ],
            [
                "Risk Alerts",
                state.alerts.filter(
                    (alert) =>
                        alert.type === "Risk"
                ).length,
                "Priority",
                "△"
            ],
            [
                "Recovery Alerts",
                state.alerts.filter(
                    (alert) =>
                        alert.type === "Recovery"
                ).length,
                "Action",
                "↺"
            ],
            [
                "Unread",
                state.alerts.filter(
                    (alert) => !alert.read
                ).length,
                "Needs review",
                "●"
            ]
        ]) +
        `
            <article class="card">
                <div class="toolbar">
                    <select id="alertFilter">
                        <option>All Types</option>

                        ${[
                            ...new Set(
                                state.alerts.map(
                                    (alert) =>
                                        alert.type
                                )
                            )
                        ]
                            .map(
                                (type) => `
                                    <option>${type}</option>
                                `
                            )
                            .join("")}
                    </select>
                </div>

                <div
                    class="timeline"
                    id="alertTimeline"
                >
                    ${alertItems(state.alerts)}
                </div>
            </article>
        `
    );
}

function alertItems(list) {
    return (
        list
            .map(
                (alert) => `
                    <div class="event">
                        <b>${alert.text}</b>

                        <div>
                            <small>
                                ${alert.time} · ${alert.type}
                            </small>

                            ${
                                alert.read
                                    ? pill("Read")
                                    : `
                                        <button
                                            class="btn"
                                            data-action="readAlert"
                                            data-id="${alert.id}"
                                        >
                                            Mark read
                                        </button>
                                    `
                            }
                        </div>
                    </div>
                `
            )
            .join("") ||
        `
            <div class="empty">
                No alerts
            </div>
        `
    );
}


/* =========================================================
   PAGE RENDERING
   ========================================================= */

const pages = {
    dashboard,
    network,
    sales,
    health,
    recommendations,
    returns: returnsPage,
    carbon,
    reports,
    alerts
};

function render(
    page =
        document.body.dataset.page ||
        "dashboard"
) {
    if (!pages[page]) {
        page = "dashboard";
    }

    document.body.dataset.page = page;

    $("#app").innerHTML =
        pages[page]();

    $$(".nav-item").forEach((item) => {
        item.classList.toggle(
            "active",
            item.dataset.page === page
        );
    });

    document.title =
        `${
            nav.find(
                (item) =>
                    item[0] === page
            )?.[2] || "Dsphere"
        } | Dsphere`;

    bindPage();
}

function bindPage() {
    $$(".table-search").forEach(
        (input) =>
            input.addEventListener(
                "input",
                filterNetwork
            )
    );

    $$(".table-filter").forEach(
        (select) =>
            select.addEventListener(
                "change",
                filterNetwork
            )
    );

    $("#alertFilter")?.addEventListener(
        "change",
        (event) => {
            $("#alertTimeline").innerHTML =
                alertItems(
                    event.target.value === "All Types"
                        ? state.alerts
                        : state.alerts.filter(
                            (alert) =>
                                alert.type ===
                                event.target.value
                        )
                );
        }
    );

    $$(".tab").forEach((tab) => {
        tab.onclick = () => {
            $$(".tab").forEach(
                (item) =>
                    item.classList.remove(
                        "active"
                    )
            );

            tab.classList.add("active");

            const rows =
                $$(".data-table tbody tr");

            rows.forEach((row) => {
                row.style.display =
                    tab.textContent ===
                        "All Recommendations" ||
                    row.firstElementChild
                        ?.textContent ===
                        tab.textContent
                        ? ""
                        : "none";
            });
        };
    });
}


/* =========================================================
   NETWORK FILTER
   ========================================================= */

function filterNetwork() {
    const query =
        $(".table-search")
            ?.value.toLowerCase() || "";

    const filter =
        $(".table-filter")?.value ||
        "All Regions";

    const filteredList =
        state.distributors.filter(
            (distributor) =>
                JSON.stringify(distributor)
                    .toLowerCase()
                    .includes(query) &&
                (
                    filter === "All Regions" ||
                    distributor.region === filter
                )
        );

    $(".table-wrap .data-table")
        ?.replaceWith(
            htmlNode(
                distributorTable(
                    filteredList
                )
            )
        );
}

const htmlNode = (html) => {
    const template =
        document.createElement("template");

    template.innerHTML =
        html.trim();

    return template.content.firstChild;
};


/* =========================================================
   MODAL
   ========================================================= */

function modal(content) {
    $("#modalBody").innerHTML =
        content;

    $("#modal").classList.add("open");

    $("#modal").setAttribute(
        "aria-hidden",
        "false"
    );
}

function closeModal() {
    $("#modal").classList.remove("open");

    $("#modal").setAttribute(
        "aria-hidden",
        "true"
    );
}

function form(
    titleText,
    fields,
    action
) {
    return `
        <h2>${titleText}</h2>

        <form
            id="modalForm"
            data-submit="${action}"
            class="form-grid"
        >
            ${fields
                .map(
                    (field) => `
                        <div class="field ${
                            field.full
                                ? "full"
                                : ""
                        }">
                            <label>
                                ${field.label}
                            </label>

                            ${
                                field.type === "select"
                                    ? `
                                        <select
                                            name="${field.name}"
                                            required
                                        >
                                            ${field.options
                                                .map(
                                                    (option) => `
                                                        <option>
                                                            ${option}
                                                        </option>
                                                    `
                                                )
                                                .join("")}
                                        </select>
                                    `
                                    : field.type === "textarea"
                                        ? `
                                            <textarea
                                                name="${field.name}"
                                                required
                                            ></textarea>
                                        `
                                        : `
                                            <input
                                                name="${field.name}"
                                                type="${field.type || "text"}"
                                                ${
                                                    field.value
                                                        ? `value="${field.value}"`
                                                        : ""
                                                }
                                                required
                                            >
                                        `
                            }
                        </div>
                    `
                )
                .join("")}

            <div class="field full">
                <button
                    class="btn primary"
                    type="submit"
                >
                    Save
                </button>
            </div>
        </form>
    `;
}


/* =========================================================
   TOAST AND BADGE
   ========================================================= */

function toast(message) {
    $("#toast").textContent =
        message;

    $("#toast").classList.add(
        "show"
    );

    setTimeout(() => {
        $("#toast").classList.remove(
            "show"
        );
    }, 2200);
}

function updateBadge() {
    $("#notifyCount").textContent =
        state.alerts.filter(
            (alert) => !alert.read
        ).length;
}


/* =========================================================
   CSV EXPORT
   ========================================================= */

function exportCSV() {
    const rows = [
        [
            "Name",
            "Region",
            "Category",
            "Status",
            "Sales",
            "Health",
            "Coverage"
        ],
        ...state.distributors.map(
            (distributor) => [
                distributor.name,
                distributor.region,
                distributor.category,
                distributor.status,
                distributor.sales,
                distributor.health,
                distributor.coverage
            ]
        )
    ];

    const csv = rows
        .map((row) =>
            row
                .map(
                    (value) =>
                        `"${String(value).replaceAll(
                            '"',
                            '""'
                        )}"`
                )
                .join(",")
        )
        .join("\n");

    const downloadLink =
        document.createElement("a");

    downloadLink.href =
        URL.createObjectURL(
            new Blob(
                [csv],
                {
                    type: "text/csv"
                }
            )
        );

    downloadLink.download =
        "dsphere-report.csv";

    downloadLink.click();

    URL.revokeObjectURL(
        downloadLink.href
    );

    toast(
        "Report exported successfully"
    );
}


/* =========================================================
   CLICK ACTIONS
   ========================================================= */

document.addEventListener(
    "click",
    (event) => {
        const navigationButton =
            event.target.closest(
                "[data-go]"
            );

        if (navigationButton) {
            location.href =
                pageFiles[
                    navigationButton.dataset.go
                ];

            return;
        }

        const button =
            event.target.closest(
                "[data-action]"
            );

        if (!button) {
            return;
        }

        const id =
            +button.dataset.id;

        const action =
            button.dataset.action;

        if (action === "export") {
            exportCSV();
        }

        if (action === "addDistributor") {
            modal(
                form(
                    "Add Distributor",
                    [
                        {
                            label: "Distributor name",
                            name: "name"
                        },
                        {
                            label: "Region",
                            name: "region",
                            type: "select",
                            options: [
                                "North",
                                "South",
                                "East",
                                "West"
                            ]
                        },
                        {
                            label: "Category",
                            name: "category",
                            type: "select",
                            options: [
                                "Beverages",
                                "Snacks",
                                "Personal Care",
                                "Home Care"
                            ]
                        },
                        {
                            label: "Status",
                            name: "status",
                            type: "select",
                            options: [
                                "Active",
                                "At Risk"
                            ]
                        }
                    ],
                    "addDistributor"
                )
            );
        }

        if (action === "deleteDistributor") {
            state.distributors =
                state.distributors.filter(
                    (distributor) =>
                        distributor.id !== id
                );

            save();
            render("network");
            toast("Distributor deleted");
        }

        if (action === "viewDistributor") {
            const distributor =
                state.distributors.find(
                    (item) =>
                        item.id === id
                );

            modal(`
                <h2>${distributor.name}</h2>

                <div class="grid two-col">
                    <div>
                        <p>
                            <b>Region</b>
                            <br>
                            ${distributor.region}
                        </p>

                        <p>
                            <b>Category</b>
                            <br>
                            ${distributor.category}
                        </p>
                    </div>

                    <div>
                        <p>
                            <b>Sales</b>
                            <br>
                            ${money(distributor.sales)}
                        </p>

                        <p>
                            <b>Health / Coverage</b>
                            <br>
                            ${distributor.health} /
                            ${distributor.coverage}%
                        </p>
                    </div>
                </div>

                <button
                    class="btn primary"
                    data-action="assessment"
                >
                    Update assessment
                </button>
            `);
        }

        if (action === "target") {
            modal(
                form(
                    "Set Performance Target",
                    [
                        {
                            label: "Target name",
                            name: "name"
                        },
                        {
                            label: "Target value",
                            name: "value",
                            type: "number"
                        },
                        {
                            label: "Period",
                            name: "period"
                        }
                    ],
                    "addTarget"
                )
            );
        }

        if (action === "assessment") {
            modal(
                form(
                    "Update Health Assessment",
                    [
                        {
                            label: "Distributor",
                            name: "name",
                            type: "select",
                            options:
                                state.distributors.map(
                                    (item) =>
                                        item.name
                                )
                        },
                        {
                            label: "Health score (0-100)",
                            name: "health",
                            type: "number"
                        },
                        {
                            label: "Remarks",
                            name: "remarks",
                            type: "textarea",
                            full: true
                        }
                    ],
                    "assessment"
                )
            );
        }

        if (action === "addRecommendation") {
            modal(
                form(
                    "Add Recommendation",
                    [
                        {
                            label: "Type",
                            name: "type",
                            type: "select",
                            options: [
                                "Retention",
                                "Corrective Action",
                                "Growth Opportunity",
                                "Risk Mitigation"
                            ]
                        },
                        {
                            label: "Priority",
                            name: "priority",
                            type: "select",
                            options: [
                                "High",
                                "Medium",
                                "Low"
                            ]
                        },
                        {
                            label: "Recommendation",
                            name: "text",
                            type: "textarea",
                            full: true
                        }
                    ],
                    "addRecommendation"
                )
            );
        }

        if (
            action ===
            "advanceRecommendation"
        ) {
            const recommendation =
                state.recommendations.find(
                    (item) =>
                        item.id === id
                );

            recommendation.status =
                recommendation.status === "Pending"
                    ? "In Progress"
                    : recommendation.status ===
                        "In Progress"
                        ? "Completed"
                        : "Pending";

            save();
            render("recommendations");

            toast(
                "Recommendation status updated"
            );
        }

        if (action === "addReturn") {
            modal(
                form(
                    "Log Return / Recovery Case",
                    [
                        {
                            label: "Distributor",
                            name: "distributor",
                            type: "select",
                            options:
                                state.distributors.map(
                                    (item) =>
                                        item.name
                                )
                        },
                        {
                            label: "Issue",
                            name: "issue"
                        },
                        {
                            label: "Amount",
                            name: "amount",
                            type: "number"
                        },
                        {
                            label: "Priority",
                            name: "priority",
                            type: "select",
                            options: [
                                "High",
                                "Medium",
                                "Low"
                            ]
                        }
                    ],
                    "addReturn"
                )
            );
        }

        if (action === "resolveReturn") {
            const returnCase =
                state.returns.find(
                    (item) =>
                        item.id === id
                );

            returnCase.status =
                returnCase.status === "Resolved"
                    ? "Pending"
                    : "Resolved";

            save();
            render("returns");

            toast(
                "Recovery case updated"
            );
        }

        if (action === "readAlert") {
            state.alerts.find(
                (item) =>
                    item.id === id
            ).read = true;

            save();
            render("alerts");
        }

        if (action === "markAllRead") {
            state.alerts.forEach(
                (item) => {
                    item.read = true;
                }
            );

            save();
            render("alerts");

            toast(
                "All notifications marked read"
            );
        }

        if (action === "applyReport") {
            const region =
                $("#reportRegion").value;

            const category =
                $("#reportCategory").value;

            const filteredList =
                state.distributors.filter(
                    (distributor) =>
                        (
                            region === "All Regions" ||
                            distributor.region === region
                        ) &&
                        (
                            category === "All Categories" ||
                            distributor.category === category
                        )
                );

            $("#reportTable").innerHTML =
                distributorTable(
                    filteredList
                );

            toast(
                `${filteredList.length} records found`
            );
        }
    }
);


/* =========================================================
   FORM SUBMISSION
   ========================================================= */

document.addEventListener(
    "submit",
    (event) => {
        if (
            event.target.id !==
            "modalForm"
        ) {
            return;
        }

        event.preventDefault();

        const data =
            Object.fromEntries(
                new FormData(
                    event.target
                )
            );

        const action =
            event.target.dataset.submit;

        if (action === "addDistributor") {
            state.distributors.push({
                id: Date.now(),
                ...data,
                sales: 0,
                health: 70,
                coverage: 80
            });
        }

        if (action === "addTarget") {
            state.targets.push({
                id: Date.now(),
                ...data,
                value: +data.value
            });
        }

        if (action === "assessment") {
            const distributor =
                state.distributors.find(
                    (item) =>
                        item.name === data.name
                );

            distributor.health =
                Math.max(
                    0,
                    Math.min(
                        100,
                        +data.health
                    )
                );

            state.activities.push({
                time:
                    new Date().toISOString(),
                text:
                    `Assessment updated for ${distributor.name}`
            });
        }

        if (
            action ===
            "addRecommendation"
        ) {
            state.recommendations.push({
                id: Date.now(),
                ...data,
                status: "Pending"
            });
        }

        if (action === "addReturn") {
            state.returns.push({
                id: Date.now(),
                ...data,
                amount: +data.amount,
                days: 0,
                status: "Pending"
            });
        }

        save();
        closeModal();

        render(
            document.body.dataset.page
        );

        toast("Saved successfully");
    }
);


/* =========================================================
   MODAL EVENTS
   ========================================================= */

const modalCloseButton =
    document.getElementById("modalClose");

const modalElement =
    document.getElementById("modal");

if (modalCloseButton) {
    modalCloseButton.addEventListener(
        "click",
        closeModal
    );
}

if (modalElement) {
    modalElement.addEventListener(
        "click",
        function (event) {
            if (event.target === modalElement) {
                closeModal();
            }
        }
    );
}


/* =========================================================
   NOTIFICATION BUTTON
   ========================================================= */

const notificationButton =
    document.getElementById("notifyButton");

function openNotificationsPage() {
    window.location.href =
        "notifications.html";
}

if (notificationButton) {
    notificationButton.addEventListener(
        "click",
        function (event) {
            event.preventDefault();
            event.stopPropagation();

            openNotificationsPage();
        }
    );

    notificationButton.addEventListener(
        "keydown",
        function (event) {
            if (
                event.key === "Enter" ||
                event.key === " "
            ) {
                event.preventDefault();
                openNotificationsPage();
            }
        }
    );
}


/* =========================================================
   GLOBAL SEARCH
   ========================================================= */

const globalSearch =
    document.getElementById("globalSearch");

if (globalSearch) {
    globalSearch.addEventListener(
        "keydown",
        function (event) {
            if (event.key !== "Enter") {
                return;
            }

            const query =
                event.target.value
                    .trim()
                    .toLowerCase();

            if (!query) {
                return;
            }

            const distributor =
                state.distributors.find(
                    function (item) {
                        return JSON.stringify(item)
                            .toLowerCase()
                            .includes(query);
                    }
                );

            if (distributor) {
                sessionStorage.setItem(
                    "dsphereSearchResult",
                    JSON.stringify(distributor)
                );

                window.location.href =
                    pageFiles.network;
            } else {
                sessionStorage.setItem(
                    "dsphereSearchTerm",
                    query
                );

                window.location.href =
                    "notifications.html";
            }
        }
    );
}


/* =========================================================
   STORED SEARCH RESULT
   ========================================================= */

const storedResult =
    sessionStorage.getItem(
        "dsphereSearchResult"
    );

if (
    document.body.dataset.page === "network" &&
    storedResult
) {
    sessionStorage.removeItem(
        "dsphereSearchResult"
    );

    window.setTimeout(
        function () {
            try {
                const distributor =
                    JSON.parse(storedResult);

                modal(`
                    <h2>Search result</h2>

                    <p>
                        <b>${distributor.name}</b>
                    </p>

                    <p>
                        ${distributor.region} ·
                        ${distributor.category} ·
                        ${distributor.status}
                    </p>
                `);
            } catch (error) {
                console.error(
                    "Unable to open stored search result:",
                    error
                );
            }
        },
        100
    );
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

updateBadge();

render(
    document.body.dataset.page ||
    "dashboard"
);