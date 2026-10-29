DSPHERE FINANCE MANAGER INTERACTIVE FRONTEND

Open index.html after extracting the ZIP.

Included: separate HTML pages, shared style.css, app.js, and the supplied logo.png.

Sidebar: only the requested top-level modules are shown. Click a module with subpages to expand or collapse its dropdown.

Interactive page actions: Add opens a validated form; Edit loads the selected row; Delete removes the selected row after confirmation; Compare/Track/History opens an analysis dialog; Export downloads visible rows as CSV. Records are stored in browser localStorage for this frontend demo.

For production, connect the same buttons to a secured backend API and database.

Invoice approval: On Invoices & Outstanding Amounts, select a row and click Approve Invoice, or use the row-level Approve button. Status changes from Pending to Approved and is saved in localStorage.

Invoice decisions: In the Approval column, ✓ sets Approved and ✕ sets Rejected after confirmation. The Finance Manager can still select a row and use Edit Invoice to modify invoice values and status. Amount Received is renamed Amount. Decisions persist in localStorage.

Header controls: the notification bell opens a notification panel; Mark all as read clears the badge. Logout asks for confirmation, clears sessionStorage, and returns to index.html.
