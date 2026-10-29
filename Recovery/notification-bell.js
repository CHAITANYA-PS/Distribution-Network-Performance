document.addEventListener("DOMContentLoaded", function () {
    const notificationBell =
        document.querySelector(".profile .bell");

    if (!notificationBell) {
        return;
    }

    function goToNotifications() {
        window.location.href = "notifications.html";
    }

    notificationBell.addEventListener(
        "click",
        goToNotifications
    );

    notificationBell.addEventListener(
        "keydown",
        function (event) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                goToNotifications();
            }
        }
    );
});