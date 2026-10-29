/** Dsphere common stakeholder login. */
"use strict";
const STAKEHOLDER_ACCOUNTS=[
 {employeeId:"ADMIN001",email:"admin@dsphere.com",password:"Admin@123",name:"System Administrator",role:"system-administrator",landingPage:"../Sysadmin/index.html"},
 {employeeId:"DIST001",email:"distributor@dsphere.com",password:"Distributor@123",name:"Distributor",role:"distributor",landingPage:"../Distributor/index.html"},
 {employeeId:"SALES001",email:"sales@dsphere.com",password:"Sales@123",name:"Sales Manager",role:"sales-manager",landingPage:"../Sales/index.html"},
 {employeeId:"RECOVERY001",email:"recovery@dsphere.com",password:"Recovery@123",name:"Recovery Manager",role:"recovery-manager",landingPage:"../Recovery/index.html"},
 {employeeId:"FINANCE001",email:"finance@dsphere.com",password:"Finance@123",name:"Finance Manager",role:"finance-manager",landingPage:"../Finance/index.html"},
 {employeeId:"MANUFACTURER001",email:"manufacturer@dsphere.com",password:"Manufacturer@123",name:"Manufacturer",role:"manufacturer",landingPage:"../Manufacturer/index.html"}
];
document.addEventListener("DOMContentLoaded",initializeLogin);
function initializeLogin(){
 const form=document.getElementById("loginForm"),user=document.getElementById("userId"),password=document.getElementById("password"),toggle=document.getElementById("togglePassword"),remember=document.getElementById("rememberMe");
 if(!form||!user||!password)return;
 const saved=localStorage.getItem("dsphereRememberedUser");if(saved){user.value=saved;if(remember)remember.checked=true;}
 user.addEventListener("input",()=>{clearError(user,"userError");clearStatus();});
 password.addEventListener("input",()=>{clearError(password,"passwordError");clearStatus();});
 toggle?.addEventListener("click",()=>{const hidden=password.type==="password";password.type=hidden?"text":"password";toggle.setAttribute("aria-label",hidden?"Hide password":"Show password");toggle.title=hidden?"Hide password":"Show password";});
 form.addEventListener("submit",event=>{event.preventDefault();login(user,password,remember);});
}
function login(user,password,remember){
 clearStatus();const identityOk=validateIdentity(user),passwordOk=validatePassword(password);
 if(!identityOk||!passwordOk){showStatus("Please correct the highlighted fields.","error");document.querySelector('[aria-invalid="true"]')?.focus();return;}
 const identity=user.value.trim().toLowerCase(),secret=password.value;
 const account=STAKEHOLDER_ACCOUNTS.find(a=>(a.email.toLowerCase()===identity||a.employeeId.toLowerCase()===identity)&&a.password===secret);
 if(!account){showStatus("The Email, Employee ID or Password is incorrect.","error");password.value="";password.focus();return;}
 if(remember?.checked)localStorage.setItem("dsphereRememberedUser",identity);else localStorage.removeItem("dsphereRememberedUser");
 sessionStorage.setItem("dsphereAuthenticatedUser",JSON.stringify({employeeId:account.employeeId,email:account.email,name:account.name,role:account.role,landingPage:account.landingPage,loginTime:new Date().toISOString()}));
 showStatus(`Login successful. Opening the ${formatRole(account.role)} dashboard.`,"success");
 const button=document.getElementById("loginButton");if(button){button.disabled=true;button.textContent="Redirecting...";}
 setTimeout(()=>window.location.replace(account.landingPage),650);
}
function validateIdentity(field){clearError(field,"userError");const value=field.value.trim();if(!value){setError(field,"userError","Email or Employee ID is required.");return false;}const email=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,employee=/^[A-Za-z]{2,20}[-_]?[0-9]{3,10}$/;if(!email.test(value)&&!employee.test(value)){setError(field,"userError","Enter a valid email address or Employee ID.");return false;}return true;}
function validatePassword(field){clearError(field,"passwordError");const value=field.value;if(!value){setError(field,"passwordError","Password is required.");return false;}if(value.length<8){setError(field,"passwordError","Password must contain at least 8 characters.");return false;}if(!/[A-Za-z]/.test(value)||!/\d/.test(value)){setError(field,"passwordError","Use at least one letter and one number.");return false;}return true;}
function setError(field,id,message){field.classList.add("invalid");field.setAttribute("aria-invalid","true");const e=document.getElementById(id);if(e)e.textContent=message;}
function clearError(field,id){field.classList.remove("invalid");field.removeAttribute("aria-invalid");const e=document.getElementById(id);if(e)e.textContent="";}
function showStatus(message,type){const e=document.getElementById("formStatus");if(e){e.textContent=message;e.className=`form-status ${type}`;}}
function clearStatus(){const e=document.getElementById("formStatus");if(e){e.textContent="";e.className="form-status";}}
function formatRole(role){return role.split("-").map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(" ");}
