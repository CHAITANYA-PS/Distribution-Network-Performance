"use strict";

document.addEventListener("DOMContentLoaded", () => {

    const form = document.getElementById("resetForm");
    const identity = document.getElementById("employeeId");
    const secretAnswer = document.getElementById("secretAnswer");
    const password = document.getElementById("newPassword");
    const confirm = document.getElementById("confirmPassword");
    const status = document.getElementById("formStatus");

    const showError = (input, id, text) => {
        input.classList.toggle("invalid", Boolean(text));
        input.setAttribute("aria-invalid", String(Boolean(text)));
        document.getElementById(id).textContent = text;
    };

    const validIdentity = value =>
        /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ||
        /^[A-Za-z]{2,10}[-_]?[0-9]{3,10}$/.test(value);

    function updateRules() {
        document.getElementById("lengthRule")
            .classList.toggle("valid", password.value.length >= 8);

        document.getElementById("caseRule")
            .classList.toggle(
                "valid",
                /[a-z]/.test(password.value) &&
                /[A-Z]/.test(password.value)
            );

        document.getElementById("numberRule")
            .classList.toggle(
                "valid",
                /\d/.test(password.value)
            );
    }

    document.querySelectorAll(".eye").forEach(button => {
        button.addEventListener("click", () => {

            const input =
                document.getElementById(button.dataset.target);

            const show = input.type === "password";

            input.type = show ? "text" : "password";

            button.setAttribute(
                "aria-label",
                show ? "Hide password" : "Show password"
            );
        });
    });

    identity.addEventListener("input", () => {
        showError(identity, "employeeError", "");
    });

    secretAnswer.addEventListener("input", () => {
        showError(secretAnswer, "secretAnswerError", "");
    });

    password.addEventListener("input", () => {
        showError(password, "newPasswordError", "");
        updateRules();
    });

    confirm.addEventListener("input", () => {
        showError(confirm, "confirmPasswordError", "");
    });

    form.addEventListener("submit", event => {

        event.preventDefault();

        const user = identity.value.trim();
        const answer = secretAnswer.value.trim();
        const secret = password.value;
        const repeated = confirm.value;

        let first = null;

        // Email / Employee ID Validation
        if (!user) {
            showError(
                identity,
                "employeeError",
                "Email or Employee ID is required."
            );
            first = identity;
        } else if (!validIdentity(user)) {
            showError(
                identity,
                "employeeError",
                "Enter a valid email or Employee ID."
            );
            first = identity;
        }

        // Secret Question Validation
        if (!answer) {
            showError(
                secretAnswer,
                "secretAnswerError",
                "Please answer the secret question."
            );
            first ||= secretAnswer;
        }

        // Password Validation
        if (!secret) {
            showError(
                password,
                "newPasswordError",
                "New password is required."
            );
            first ||= password;

        } else if (
            secret.length < 8 ||
            !/[a-z]/.test(secret) ||
            !/[A-Z]/.test(secret) ||
            !/\d/.test(secret)
        ) {
            showError(
                password,
                "newPasswordError",
                "Password does not meet all requirements."
            );
            first ||= password;
        }

        // Confirm Password Validation
        if (!repeated) {
            showError(
                confirm,
                "confirmPasswordError",
                "Please confirm the new password."
            );
            first ||= confirm;

        } else if (secret !== repeated) {
            showError(
                confirm,
                "confirmPasswordError",
                "Passwords do not match."
            );
            first ||= confirm;
        }

        // Stop if validation fails
        if (first) {
            status.textContent = "";
            first.focus();
            return;
        }

        // Success
        status.textContent =
            "Password reset successful. Redirecting to Login page...";

        sessionStorage.removeItem("dsphereLoggedIn");

        setTimeout(() => {
            window.location.href = "../Login/index.html";
        }, 1500);

    });

    updateRules();

});