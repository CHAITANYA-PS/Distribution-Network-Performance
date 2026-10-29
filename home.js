"use strict";
document.addEventListener("DOMContentLoaded",()=>{
  const button=document.getElementById("menuButton");
  const nav=document.getElementById("homeNav");
  button.addEventListener("click",()=>{
    const open=nav.classList.toggle("open");
    button.setAttribute("aria-expanded",String(open));
    button.textContent=open?"×":"☰";
  });
  nav.querySelectorAll('a[href^="#"]').forEach(link=>link.addEventListener("click",()=>{
    nav.classList.remove("open");
    button.setAttribute("aria-expanded","false");
    button.textContent="☰";
  }));
});
