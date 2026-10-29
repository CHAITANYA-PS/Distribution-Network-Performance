/* Dsphere Recovery & Resolution Management - complete in-card validation */
(() => {
  'use strict';
  const $=(s,c=document)=>c.querySelector(s), $$=(s,c=document)=>[...c.querySelectorAll(s)];
  const page=location.pathname.split('/').pop()||'index.html';
  const value=f=>(f?.value??'').trim();
  const today=()=>{const d=new Date();d.setHours(0,0,0,0);return d};

  function cardOf(source){return source?.closest?.('.card')||$('main')||document.body}
  function statusHost(source){
    const card=cardOf(source); let host=$(':scope > .form-status-message',card);
    if(!host){host=document.createElement('div');host.className='form-status-message';const h=$(':scope > h2, :scope > h3, :scope > .card-title',card);h?h.insertAdjacentElement('afterend',host):card.prepend(host)}
    return host;
  }
  function message(source,text,type='info',timeout=0){
    const host=statusHost(source);host.className=`form-status-message ${type}`;host.setAttribute('role',type==='error'?'alert':'status');host.setAttribute('aria-live','polite');host.innerHTML='';
    const span=document.createElement('span');span.textContent=text;const close=document.createElement('button');close.type='button';close.className='form-status-close';close.textContent='×';close.setAttribute('aria-label','Close message');close.onclick=()=>host.remove();host.append(span,close);if(timeout)setTimeout(()=>host.remove(),timeout);return host;
  }
  function confirmInCard(source,text,onConfirm){
    const host=message(source,text,'confirm');const actions=document.createElement('span');actions.className='form-status-actions';
    const yes=document.createElement('button');yes.type='button';yes.className='form-confirm-button';yes.textContent='Confirm';
    const no=document.createElement('button');no.type='button';no.className='form-cancel-button';no.textContent='Cancel';actions.append(yes,no);host.insertBefore(actions,$('.form-status-close',host));
    yes.onclick=()=>{host.remove();onConfirm()};no.onclick=()=>host.remove();yes.focus();
  }
  function errorNode(field){let n=field.parentElement?.querySelector(':scope > .validation-error');if(!n){n=document.createElement('small');n.className='validation-error';n.setAttribute('role','alert');field.insertAdjacentElement('afterend',n)}return n}
  function error(field,text){if(!field)return false;field.classList.add('input-error');field.setAttribute('aria-invalid','true');errorNode(field).textContent=text;return false}
  function clear(field){if(!field)return;field.classList.remove('input-error');field.removeAttribute('aria-invalid');const n=field.parentElement?.querySelector(':scope > .validation-error');if(n)n.remove()}
  function label(field){const id=field.id&&document.querySelector(`label[for="${field.id}"]`);if(id)return id.textContent.trim();const prev=field.previousElementSibling;if(prev?.tagName==='LABEL')return prev.textContent.trim();const grid=field.closest('.form-grid');if(grid){const a=[...grid.children],i=a.indexOf(field);for(let x=i-1;x>=0;x--)if(a[x].tagName==='LABEL')return a[x].textContent.trim()}return field.dataset.label||field.name||field.placeholder||'This field'}
  function required(field,name=label(field)){if(!field||field.disabled||field.readOnly)return true;return value(field)?(clear(field),true):error(field,`${name} is required.`)}
  function minLength(field,min,name=label(field)){if(!required(field,name))return false;return value(field).length>=min?(clear(field),true):error(field,`${name} must contain at least ${min} characters.`)}
  function positive(field,name=label(field)){const n=Number(value(field).replace(/[₹,$,%\s]/g,'').replace(/,/g,''));return Number.isFinite(n)&&n>0?(clear(field),true):error(field,`${name} must be greater than zero.`)}
  function dateValid(field,name=label(field)){if(!required(field,name))return false;const d=new Date(`${field.value}T00:00:00`);return Number.isNaN(d.getTime())?error(field,`Enter a valid ${name.toLowerCase()}.`):(clear(field),true)}
  function future(field,name=label(field)){if(!dateValid(field,name))return false;return new Date(`${field.value}T00:00:00`)>=today()?(clear(field),true):error(field,`${name} cannot be in the past.`)}
  function notFuture(field,name=label(field)){if(!dateValid(field,name))return false;return new Date(`${field.value}T00:00:00`)<=today()?(clear(field),true):error(field,`${name} cannot be in the future.`)}
  function range(start,end){const a=dateValid(start,'Start date'),b=dateValid(end,'End date');if(!a||!b)return false;return new Date(end.value)>=new Date(start.value)?(clear(end),true):error(end,'End date must be on or after the start date.')}
  function fileValid(field,mandatory=true){if(!field)return true;if(!field.files.length)return mandatory?error(field,'Please choose a file before continuing.'):true;const f=field.files[0],ext=f.name.split('.').pop().toLowerCase(),allowed=['pdf','png','jpg','jpeg','docx','xlsx','csv'];if(!allowed.includes(ext))return error(field,'Allowed files: PDF, PNG, JPG, DOCX, XLSX and CSV.');if(f.size>5*1024*1024)return error(field,'File size must not exceed 5 MB.');clear(field);return true}
  function selectChosen(field,name=label(field)){if(!field)return true;const v=value(field),t=field.options[field.selectedIndex]?.text.trim()||'';return v&& !/^(select|choose)/i.test(t)?(clear(field),true):error(field,`${name} is required.`)}
  function firstInvalid(source){const f=cardOf(source).querySelector('.input-error')||$('.input-error');if(f)f.focus();message(source,'Please correct the highlighted fields.','error')}
  function checkFields(scope,{includeFiles=true}={}){let ok=true;$$('input:not([type=checkbox]):not([type=radio]),select,textarea',scope).forEach(f=>{if(f.classList.contains('global-search')||f.closest('.filters')||f.readOnly)return;if(f.type==='file'){if(includeFiles&&!fileValid(f,true))ok=false}else if(f.tagName==='SELECT'){if(!selectChosen(f))ok=false}else if(!required(f)){ok=false}});return ok}
  function success(button){message(button,button.dataset.message||'Validation successful. The action is completed.','success',6000)}

  function dynamicForm(button,type){
    const card=cardOf(button);let panel=$(`.inline-action-form[data-form="${type}"]`,card);if(panel){panel.remove();return false}
    const forms={
      ticket:{title:'Create Ticket',fields:[['select','Category','Stock Issue|Delivery Delay|Damaged Product|Price Discrepancy'],['select','Distributor','ABC Traders|XYZ Distributors|Global Retail'],['select','Priority','High|Medium|Low'],['number','SLA Hours',''],['textarea','Problem Description',''],['file','Supporting Attachment','']]},
      action:{title:'Add Corrective Action',fields:[['textarea','Corrective Action',''],['select','Owner','IT Operations|Planning Team|Regional Sales'],['date','Due Date',''],['select','Priority','High|Medium|Low'],['select','Status','Assigned|In Progress'],['file','Completion Evidence','']]},
      escalation:{title:'New Escalation',fields:[['text','Ticket ID',''],['select','Escalation Level','Level 1|Level 2|Level 3'],['select','Escalation Owner','Recovery Lead|Regional Head|Finance Manager'],['textarea','Escalation Reason',''],['date','Next Action Date','']]},
      reassign:{title:'Reassign Ticket',fields:[['select','New Owner','John Doe|Priya Singh|Michael'],['textarea','Reassignment Reason','']]},
      reopen:{title:'Reopen Ticket',fields:[['textarea','Reopening Reason',''],['date','New Due Date','']]}
    };
    const cfg=forms[type];panel=document.createElement('section');panel.className='inline-action-form';panel.dataset.form=type;panel.innerHTML=`<h3>${cfg.title}</h3><div class="dynamic-form-grid"></div><div class="actions"><button type="button" class="outline dynamic-cancel">Cancel</button><button type="button" class="dynamic-submit">Validate & Continue</button></div>`;
    const grid=$('.dynamic-form-grid',panel);cfg.fields.forEach(([kind,name,options])=>{const id=`${type}-${name.toLowerCase().replace(/\W+/g,'-')}`;const l=document.createElement('label');l.htmlFor=id;l.textContent=`${name} *`;let f;if(kind==='select'){f=document.createElement('select');f.innerHTML=`<option value="">Select ${name}</option>`+options.split('|').map(o=>`<option value="${o}">${o}</option>`).join('')}else if(kind==='textarea'){f=document.createElement('textarea');f.placeholder=`Enter ${name.toLowerCase()}`;}else{f=document.createElement('input');f.type=kind; if(kind==='number')f.min='1';if(kind==='date')f.min=new Date().toISOString().slice(0,10)}f.id=id;f.dataset.label=name;f.required=true;grid.append(l,f)});
    button.insertAdjacentElement('afterend',panel);$('.dynamic-cancel',panel).onclick=()=>panel.remove();$('.dynamic-submit',panel).onclick=e=>validateDynamic(e.currentTarget,type,button);panel.scrollIntoView({behavior:'smooth',block:'nearest'});return false;
  }
  function validateDynamic(submit,type,origin){const panel=submit.closest('.inline-action-form');let ok=checkFields(panel);$$('textarea',panel).forEach(f=>{if(!minLength(f,type==='ticket'?15:10,label(f)))ok=false});$$('input[type=number]',panel).forEach(f=>{if(!positive(f,label(f)))ok=false});$$('input[type=date]',panel).forEach(f=>{if(!future(f,label(f)))ok=false});$$('input[type=file]',panel).forEach(f=>{if(!fileValid(f,true))ok=false});if(!ok){firstInvalid(submit);return}confirmInCard(submit,`Confirm ${$('.inline-action-form h3',panel).textContent}?`,()=>{message(origin,`${$('.inline-action-form h3',panel).textContent} validated successfully.`,'success',6000);panel.remove()})}

  function validateAction(button){const action=button.textContent.trim().toLowerCase();let ok=true;
    if(page==='recovery-mode.html'&&action==='update'){const d=$$('.form-grid input[type=date]');ok=range(d[0],d[1]);ok=minLength($('textarea'),10,'Recovery reason')&&ok}
    else if(page==='target-assignment.html'&&action.includes('assign target')){ok=checkFields(cardOf(button));ok=positive($('.form-grid input:not([type=date])'),'Target value')&&ok;ok=future($('.form-grid input[type=date]'),'Due date')&&ok}
    else if(page==='create-dispute.html'&&action==='create dispute'){ok=$$('.card').every(c=>checkFields(c));const cards=$$('.card');ok=positive($$('input',cards[0]).find(f=>f.value.includes('₹')),'Disputed amount')&&ok;ok=minLength($('textarea',cards[0]),15,'Description')&&ok;ok=future($('input[type=date]',cards[1]),'Target date')&&ok;ok=fileValid($('input[type=file]',cards[1]),true)&&ok}
    else if(page==='investigation-center.html'&&action.includes('save investigation')){ok=checkFields($('main'));const t=$$('textarea');ok=minLength(t[0],15,'Problem statement')&&ok;ok=minLength(t[1],20,'Investigation notes')&&ok;$$('.why input').forEach((f,i)=>{if(!required(f,`Why ${i+1}`))ok=false});ok=fileValid($('input[type=file]'),true)&&ok}
    else if(page==='resolution-validation.html'&&action.includes('submit validation')){ok=minLength($('textarea'),20,'Resolution summary');const checks=$$('.check-list input[type=checkbox]');checks.forEach(c=>{if(!c.checked){c.classList.add('input-error');ok=false}else clear(c)});if(checks.some(c=>!c.checked))message(button,'Complete all mandatory validation checklist items.','error');const status=$('input[name=status]:checked');if(!status){message(button,'Select Approve, Reject or Send for Rework.','error');ok=false}const comments=$$('textarea')[1];if(status&&!/approve/i.test(status.parentElement.textContent))ok=minLength(comments,10,'Reviewer comments')&&ok;ok=notFuture($('input[type=date]'),'Resolution date')&&ok}
    else if(page==='communication-history.html'&&action==='apply'){ok=dateValid($('.filters input[type=date]'),'Start date')}
    else if(action==='generate report'){ok=dateValid($('.filters input[type=date]'),'Report date')}
    else if(/export pdf|export excel|schedule report|^export$/.test(action)){if(!$('table tbody tr,.bars,.donut')){message(button,'No data is available to export or schedule.','error');ok=false}}
    if(!ok){if(!cardOf(button).querySelector('.form-status-message.error'))firstInvalid(button);return false}return true}

  function bind(){
    $$('input,select,textarea').forEach(f=>{f.addEventListener('input',()=>clear(f));f.addEventListener('change',()=>{clear(f);if(f.type==='file'&&f.files.length)fileValid(f,true)})});
    document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const a=b.textContent.trim().toLowerCase();
      if(b.classList.contains('dynamic-submit')||b.classList.contains('dynamic-cancel')||b.classList.contains('form-confirm-button')||b.classList.contains('form-cancel-button')||b.classList.contains('form-status-close'))return;
      if(a.includes('create ticket')){e.preventDefault();dynamicForm(b,'ticket');return}if(a.includes('add action')){e.preventDefault();dynamicForm(b,'action');return}if(a.includes('new escalation')){e.preventDefault();dynamicForm(b,'escalation');return}if(a==='reassign'){e.preventDefault();dynamicForm(b,'reassign');return}if(a==='reopen'){e.preventDefault();dynamicForm(b,'reopen');return}
      if(b.dataset.message){e.preventDefault();e.stopImmediatePropagation();if(!validateAction(b))return;confirmInCard(b,`Confirm ${b.textContent.trim()}?`,()=>success(b))}
      else if(a==='review'){e.preventDefault();confirmInCard(b,'Open this record for review?',()=>message(b,'Record opened for review successfully.','success',6000))}
    },true);
    $$('form').forEach(form=>form.addEventListener('submit',e=>{if(!checkFields(form)){e.preventDefault();firstInvalid(form)}}));
  }
  document.addEventListener('DOMContentLoaded',bind);
})();
