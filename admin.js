/* ================================================================
   INVESTPRO GH — admin.js
   FIXES:
   - Deposit approval working correctly
   - Separate MTN and Telecel number lists
   - Transaction history loads without index error
   - Settings saved to Firebase
   ================================================================ */

import { db, collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, query, where, serverTimestamp } from './firebase.js';

const WDR_FEE=0.014, REF_BONUS=0.05;
const f2=n=>parseFloat(n||0).toFixed(2);
const fdate=ts=>{if(!ts)return'—';const d=ts.toDate?ts.toDate():new Date(ts);return d.toLocaleString('en-GH',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});};

let _cfg={};

function toast(msg,type='success'){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.className='toast show '+type;setTimeout(()=>{t.className='toast';},3400);}
function modal(icon,title,body){document.getElementById('modalIcon').textContent=icon;document.getElementById('modalTitle').textContent=title;document.getElementById('modalBody').innerHTML=body;document.getElementById('modal').style.display='flex';}
function closeModal(){document.getElementById('modal').style.display='none';}
function showLoading(s){const el=document.getElementById('loadingOverlay');if(el)el.style.display=s?'flex':'none';}

/* ===== LOAD/SAVE SETTINGS FIREBASE ===== */
async function loadCfg(){
  try{const snap=await getDoc(doc(db,'settings','config'));_cfg=snap.exists()?snap.data():{};}
  catch(e){_cfg={};}
}
async function saveCfg(data){
  try{await setDoc(doc(db,'settings','config'),data,{merge:true});return true;}
  catch(e){console.error('Save cfg:',e);return false;}
}

/* ===== AUTH ===== */
async function adminLogin(){
  const pass=document.getElementById('adminPass').value;
  showLoading(true);
  await loadCfg();
  showLoading(false);
  if(pass!==(_cfg.adminPass||'admin123')){toast('Invalid password','error');return;}
  localStorage.setItem('ip_adm','1');
  document.getElementById('adminAuthScreen').style.display='none';
  document.getElementById('adminApp').style.display='block';
  loadAdmin();
}
function adminLogout(){localStorage.removeItem('ip_adm');location.reload();}

async function loadAdmin(){
  await loadCfg();
  renderOverview();
  renderDeps('pending');
  renderWdrs('pending');
  renderUsers();
  renderInvs();
  populateSettingsForm();
  // Badge unread support messages
  try{
    const q=query(collection(db,'support'),where('sender','==','user'),where('read','==',false));
    const snap=await getDocs(q);
    if(snap.size>0){
      const link=document.querySelector('.admin-sidebar [data-page="support"]');
      if(link)link.innerHTML='<span class="nav-icon">💬</span>Support <span style="background:#ef4444;color:#fff;font-size:.65rem;padding:1px 6px;border-radius:20px;margin-left:4px;">'+snap.size+'</span>';
    }
  }catch(e){}
}

function aPage(page){
  document.querySelectorAll('#adminApp .page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.admin-sidebar .nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('admin-page-'+page)?.classList.add('active');
  document.querySelector('.admin-sidebar [data-page="'+page+'"]')?.classList.add('active');
  if(page==='deposits')    renderDeps('pending');
  if(page==='withdrawals') renderWdrs('pending');
  if(page==='users')       renderUsers();
  if(page==='investments') renderInvs();
  if(page==='overview')    renderOverview();
  if(page==='support')     renderSupport();
  if(page==='settings')    populateSettingsForm();
}

/* ===== OVERVIEW ===== */
async function renderOverview(){
  try{
    const[uSnap,txSnap,invSnap]=await Promise.all([
      getDocs(collection(db,'users')),
      getDocs(collection(db,'transactions')),
      getDocs(collection(db,'investments'))
    ]);
    const txs=txSnap.docs.map(d=>d.data()),invs=invSnap.docs.map(d=>d.data());
    document.getElementById('ovUsers').textContent=uSnap.size;
    document.getElementById('ovPendDep').textContent=txs.filter(t=>t.type==='deposit'&&t.status==='pending').length;
    document.getElementById('ovPendWdr').textContent=txs.filter(t=>t.type==='withdraw'&&t.status==='pending').length;
    document.getElementById('ovTotDep').textContent=f2(txs.filter(t=>t.type==='deposit'&&t.status==='approved').reduce((s,t)=>s+t.amount,0));
    document.getElementById('ovTotWdr').textContent=f2(txs.filter(t=>t.type==='withdraw'&&t.status==='approved').reduce((s,t)=>s+t.amount,0));
    document.getElementById('ovActInv').textContent=invs.filter(i=>i.status==='active').length;
  }catch(e){console.warn('Overview:',e);}
}

/* ===== DEPOSITS ===== */
let _df='pending';
async function renderDeps(filter){
  _df=filter;
  const el=document.getElementById('depList');
  el.innerHTML='<div style="padding:2rem;text-align:center;opacity:.4">Loading...</div>';
  try{
    // No orderBy — sort in JS
    const q=filter==='all'
      ?query(collection(db,'transactions'),where('type','==','deposit'))
      :query(collection(db,'transactions'),where('type','==','deposit'),where('status','==',filter));
    const snap=await getDocs(q);
    const txs=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{
      const at=a.createdAt?.toDate?a.createdAt.toDate():new Date(0);
      const bt=b.createdAt?.toDate?b.createdAt.toDate():new Date(0);
      return bt-at;
    });
    if(!txs.length){el.innerHTML='<div style="padding:2rem;text-align:center;opacity:.4">No deposits found.</div>';return;}
    el.innerHTML='<table class="a-table"><thead><tr><th>Date</th><th>User</th><th>Amount</th><th>Network</th><th>Reference</th><th>Account</th><th>Status</th><th>Actions</th></tr></thead><tbody>'+
    txs.map(t=>`<tr>
      <td style="font-size:.75rem">${fdate(t.createdAt)}</td>
      <td><strong>${t.userName||'—'}</strong><br><small style="opacity:.5">${t.userPhone||''}</small></td>
      <td><strong>GHS ${f2(t.amount)}</strong></td>
      <td><span style="font-size:.75rem;padding:2px 7px;border-radius:20px;background:rgba(240,192,64,.15);color:#f0c040;">${(t.network||'mtn').toUpperCase()}</span></td>
      <td><code style="color:#f0c040;font-size:.78rem">${t.ref||'—'}</code></td>
      <td style="font-size:.78rem">${t.account||'—'}<br><small style="opacity:.5">${t.accountLabel||''}</small></td>
      <td><span class="status-pill sp-${t.status}">${t.status}</span></td>
      <td>${t.status==='pending'
        ?`<button class="btn-app" onclick="approveDep('${t.id}','${t.userPhone}',${t.amount})">Approve</button>
           <button class="btn-rej" onclick="rejectDep('${t.id}','${t.userPhone}',${t.amount})">Reject</button>`
        :'—'
      }</td>
    </tr>`).join('')+'</tbody></table>';
  }catch(e){el.innerHTML='<div style="padding:2rem;text-align:center;color:#ef4444">Error loading deposits. Check console.</div>';console.error('Deps error:',e);}
}
function fDep(f,btn){document.querySelectorAll('#admin-page-deposits .filter-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderDeps(f);}

async function approveDep(txId,userPhone,amount){
  if(!userPhone||!amount){toast('Missing user info','error');return;}
  showLoading(true);
  try{
    // 1. Mark transaction approved
    await updateDoc(doc(db,'transactions',txId),{status:'approved',approvedAt:serverTimestamp()});

    // 2. Get user and credit balance
    const uSnap=await getDoc(doc(db,'users',userPhone));
    if(!uSnap.exists()){showLoading(false);toast('User not found','error');return;}
    const u=uSnap.data();
    const newBal=parseFloat(((u.balance||0)+amount).toFixed(2));
    const newDep=parseFloat(((u.deposited||0)+amount).toFixed(2));
    await updateDoc(doc(db,'users',userPhone),{balance:newBal,deposited:newDep});

    // 3. Referral bonus on FIRST deposit
    if(u.referredBy&&!u.bonusPaid){
      try{
        const refQ=query(collection(db,'users'),where('refCode','==',u.referredBy));
        const refSnap=await getDocs(refQ);
        if(!refSnap.empty){
          const refDoc=refSnap.docs[0],ref=refDoc.data();
          const bonus=parseFloat((amount*REF_BONUS).toFixed(2));
          await updateDoc(doc(db,'users',refDoc.id),{
            balance:parseFloat(((ref.balance||0)+bonus).toFixed(2)),
            refEarned:parseFloat(((ref.refEarned||0)+bonus).toFixed(2)),
            refCount:(ref.refCount||0)+1
          });
          await addDoc(collection(db,'transactions'),{
            userId:ref.phone,userName:ref.name,userPhone:ref.phone,
            type:'referral',amount:bonus,status:'approved',
            description:'Referral bonus — '+u.name+' first deposit GHS '+f2(amount),
            createdAt:serverTimestamp()
          });
          await updateDoc(doc(db,'users',userPhone),{bonusPaid:true});
          toast('✅ Approved + Referral bonus GHS '+f2(bonus)+' paid to '+ref.name);
        }
      }catch(re){console.warn('Referral error:',re);}
    }

    // 4. Notify
    smsNote('InvestPro GH: GHS '+f2(amount)+' deposit approved for '+u.name+' ('+u.phone+'). Balance credited.');

    showLoading(false);
    toast('✅ Deposit of GHS '+f2(amount)+' approved for '+u.name);
    renderDeps(_df);renderOverview();
  }catch(e){showLoading(false);console.error('Approve deposit error:',e);toast('Error approving. Check console.','error');}
}

async function rejectDep(txId,userPhone,amount){
  if(!confirm('Reject this deposit?'))return;
  showLoading(true);
  try{
    await updateDoc(doc(db,'transactions',txId),{status:'rejected',rejectedAt:serverTimestamp()});
    showLoading(false);toast('Deposit rejected');renderDeps(_df);renderOverview();
  }catch(e){showLoading(false);toast('Error','error');}
}

/* ===== WITHDRAWALS ===== */
let _wf='pending';
async function renderWdrs(filter){
  _wf=filter;
  const el=document.getElementById('wdrList');
  el.innerHTML='<div style="padding:2rem;text-align:center;opacity:.4">Loading...</div>';
  try{
    const q=filter==='all'
      ?query(collection(db,'transactions'),where('type','==','withdraw'))
      :query(collection(db,'transactions'),where('type','==','withdraw'),where('status','==',filter));
    const snap=await getDocs(q);
    const txs=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{
      const at=a.createdAt?.toDate?a.createdAt.toDate():new Date(0);
      const bt=b.createdAt?.toDate?b.createdAt.toDate():new Date(0);
      return bt-at;
    });
    if(!txs.length){el.innerHTML='<div style="padding:2rem;text-align:center;opacity:.4">No withdrawals found.</div>';return;}
    el.innerHTML='<table class="a-table"><thead><tr><th>Date</th><th>User</th><th>Requested</th><th>Fee</th><th>Send This</th><th>MoMo</th><th>Status</th><th>Actions</th></tr></thead><tbody>'+
    txs.map(t=>{
      const fee=parseFloat((t.amount*WDR_FEE).toFixed(2));
      const receives=t.youReceive!=null?t.youReceive:parseFloat((t.amount-fee).toFixed(2));
      return`<tr>
        <td style="font-size:.75rem">${fdate(t.createdAt)}</td>
        <td><strong>${t.userName||'—'}</strong><br><small style="opacity:.5">${t.userPhone||''}</small></td>
        <td>GHS ${f2(t.amount)}</td>
        <td style="color:#ef4444">GHS ${f2(fee)}</td>
        <td><strong style="color:#22c55e">GHS ${f2(receives)}</strong></td>
        <td><strong>${t.network||'—'}</strong><br><small>${t.momo||''}</small></td>
        <td><span class="status-pill sp-${t.status}">${t.status}</span></td>
        <td>${t.status==='pending'
          ?`<button class="btn-app" onclick="approveWdr('${t.id}','${t.userPhone}',${t.amount},'${t.network||''}','${t.momo||''}')">Approve</button>
             <button class="btn-rej" onclick="rejectWdr('${t.id}','${t.userPhone}',${t.amount})">Reject</button>`
          :'—'
        }</td>
      </tr>`;
    }).join('')+'</tbody></table>';
  }catch(e){el.innerHTML='<div style="padding:2rem;text-align:center;color:#ef4444">Error loading.</div>';console.error(e);}
}
function fWdr(f,btn){document.querySelectorAll('#admin-page-withdrawals .filter-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderWdrs(f);}

async function approveWdr(txId,userPhone,amount,network,momo){
  showLoading(true);
  try{
    await updateDoc(doc(db,'transactions',txId),{status:'approved',approvedAt:serverTimestamp()});
    const fee=parseFloat((amount*WDR_FEE).toFixed(2));
    const receives=parseFloat((amount-fee).toFixed(2));
    smsNote('InvestPro GH: Withdrawal approved.\nSend GHS '+f2(receives)+' to '+network+' '+momo);
    showLoading(false);
    toast('✅ Approved — Send GHS '+f2(receives)+' to '+network+' '+momo);
    renderWdrs(_wf);renderOverview();
  }catch(e){showLoading(false);toast('Error','error');console.error(e);}
}

async function rejectWdr(txId,userPhone,amount){
  if(!confirm('Reject and refund GHS '+f2(amount)+' to user?'))return;
  showLoading(true);
  try{
    await updateDoc(doc(db,'transactions',txId),{status:'rejected',rejectedAt:serverTimestamp()});
    const uSnap=await getDoc(doc(db,'users',userPhone));
    if(uSnap.exists()){
      const u=uSnap.data();
      await updateDoc(doc(db,'users',userPhone),{
        balance:parseFloat(((u.balance||0)+amount).toFixed(2)),
        withdrawn:Math.max(0,parseFloat(((u.withdrawn||0)-amount).toFixed(2)))
      });
      await addDoc(collection(db,'transactions'),{
        userId:u.phone,userName:u.name,userPhone:u.phone,
        type:'deposit',amount,status:'approved',
        description:'Withdrawal rejected — GHS '+f2(amount)+' refunded',
        createdAt:serverTimestamp()
      });
    }
    showLoading(false);toast('Rejected & refunded');renderWdrs(_wf);renderOverview();
  }catch(e){showLoading(false);toast('Error','error');}
}

/* ===== USERS ===== */
async function renderUsers(){
  const el=document.getElementById('userList');
  el.innerHTML='<div style="padding:2rem;text-align:center;opacity:.4">Loading...</div>';
  try{
    const snap=await getDocs(collection(db,'users'));
    const users=snap.docs.map(d=>d.data()).filter(u=>!u.deleted).sort((a,b)=>{
      const at=a.joined?.toDate?a.joined.toDate():new Date(0);
      const bt=b.joined?.toDate?b.joined.toDate():new Date(0);
      return bt-at;
    });
    if(!users.length){el.innerHTML='<div style="padding:2rem;text-align:center;opacity:.4">No users yet.</div>';return;}
    el.innerHTML='<table class="a-table"><thead><tr><th>Name</th><th>Phone</th><th>Balance</th><th>Deposited</th><th>Withdrawn</th><th>Ref Code</th><th>Joined</th><th>Actions</th></tr></thead><tbody>'+
    users.map(u=>`<tr>
      <td><strong>${u.name}</strong></td>
      <td>${u.phone}</td>
      <td><div class="bal-edit"><input type="number" id="b_${u.phone}" value="${f2(u.balance)}" step="0.01" style="width:90px"/><button class="btn-set" onclick="setBalance('${u.phone}')">Set</button></div></td>
      <td>GHS ${f2(u.deposited)}</td>
      <td>GHS ${f2(u.withdrawn)}</td>
      <td style="color:#f0c040;font-size:.78rem">${u.refCode||'—'}</td>
      <td style="font-size:.75rem">${fdate(u.joined)}</td>
      <td><button class="btn-del" onclick="delUser('${u.phone}')">Delete</button></td>
    </tr>`).join('')+'</tbody></table>';
  }catch(e){el.innerHTML='<div style="padding:2rem;text-align:center;color:#ef4444">Error loading users.</div>';console.error(e);}
}

async function setBalance(phone){
  const nb=parseFloat(document.getElementById('b_'+phone).value);
  if(isNaN(nb)||nb<0){toast('Invalid balance','error');return;}
  showLoading(true);
  try{
    const snap=await getDoc(doc(db,'users',phone));
    const u=snap.data();
    const diff=parseFloat((nb-u.balance).toFixed(2));
    await updateDoc(doc(db,'users',phone),{balance:nb});
    if(diff!==0){
      await addDoc(collection(db,'transactions'),{
        userId:u.phone,userName:u.name,userPhone:u.phone,
        type:diff>0?'deposit':'withdraw',amount:Math.abs(diff),status:'approved',
        description:'Admin balance adjustment ('+(diff>0?'+':'')+f2(diff)+')',
        createdAt:serverTimestamp()
      });
    }
    showLoading(false);toast('Balance updated for '+u.name);renderUsers();
  }catch(e){showLoading(false);toast('Error','error');}
}

async function delUser(phone){
  if(!confirm('⚠️ DELETE user '+phone+'?\n\nThis will permanently remove their account and zero their balance.\n\nThis CANNOT be undone!'))return;
  showLoading(true);
  try{
    // Zero balance and mark deleted — Firestore doesn't support true doc deletion from client easily
    await updateDoc(doc(db,'users',phone),{
      deleted:true,
      balance:0,
      deposited:0,
      withdrawn:0,
      invested:0,
      profit:0,
      refEarned:0,
      pass:'__DELETED__',
      deletedAt:serverTimestamp()
    });
    // Cancel all active investments for this user
    try{
      const invQ=query(collection(db,'investments'),where('userId','==',phone),where('status','==','active'));
      const invSnap=await getDocs(invQ);
      for(const invDoc of invSnap.docs){
        await updateDoc(doc(db,'investments',invDoc.id),{status:'cancelled'});
      }
    }catch(ie){console.warn('Cancel investments:',ie);}
    showLoading(false);
    toast('✅ User account deleted successfully');
    renderUsers();renderOverview();
  }catch(e){showLoading(false);toast('Error deleting user','error');console.error(e);}
}

/* ===== INVESTMENTS ===== */
async function renderInvs(){
  const el=document.getElementById('invList');
  el.innerHTML='<div style="padding:2rem;text-align:center;opacity:.4">Loading...</div>';
  try{
    const snap=await getDocs(collection(db,'investments'));
    const invs=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{
      const at=a.startDate?.toDate?a.startDate.toDate():new Date(0);
      const bt=b.startDate?.toDate?b.startDate.toDate():new Date(0);
      return bt-at;
    });
    if(!invs.length){el.innerHTML='<div style="padding:2rem;text-align:center;opacity:.4">No investments yet.</div>';return;}
    el.innerHTML='<table class="a-table"><thead><tr><th>User</th><th>Amount</th><th>Daily</th><th>Credited</th><th>Start</th><th>Status</th></tr></thead><tbody>'+
    invs.map(inv=>{
      const start=inv.startDate?.toDate?inv.startDate.toDate():new Date(0);
      const d=Math.min(Math.floor((Date.now()-start.getTime())/86400000),30);
      return`<tr>
        <td><strong>${inv.userName||'—'}</strong><br><small style="opacity:.5">${inv.userId||''}</small></td>
        <td><strong>GHS ${f2(inv.amount)}</strong></td>
        <td style="color:#22c55e">GHS ${f2(inv.daily)}/day</td>
        <td>GHS ${f2(inv.credited)}</td>
        <td style="font-size:.75rem">${fdate(inv.startDate)}</td>
        <td><span class="status-pill sp-${inv.status}">${inv.status} — Day ${d}/30</span></td>
      </tr>`;
    }).join('')+'</tbody></table>';
  }catch(e){el.innerHTML='<div style="padding:2rem;text-align:center;color:#ef4444">Error loading.</div>';console.error(e);}
}

/* ===== PROFIT SIMULATION ===== */
async function runProfitSim(){
  if(!confirm('Credit 5% daily profit to ALL active investments now?'))return;
  showLoading(true);
  try{
    const snap=await getDocs(query(collection(db,'investments'),where('status','==','active')));
    let count=0,total=0;
    for(const invDoc of snap.docs){
      const inv=invDoc.data();
      const start=inv.startDate?.toDate?inv.startDate.toDate().getTime():Date.now();
      const days=Math.floor((Date.now()-start)/86400000);
      if(days>=30){await updateDoc(doc(db,'investments',invDoc.id),{status:'completed'});continue;}
      const profit=parseFloat(inv.daily.toFixed(2));
      await updateDoc(doc(db,'investments',invDoc.id),{credited:parseFloat(((inv.credited||0)+profit).toFixed(2)),lastCredit:serverTimestamp()});
      const uSnap=await getDoc(doc(db,'users',inv.userId));
      if(uSnap.exists()){
        const u=uSnap.data();
        await updateDoc(doc(db,'users',inv.userId),{balance:parseFloat(((u.balance||0)+profit).toFixed(2)),profit:parseFloat(((u.profit||0)+profit).toFixed(2))});
        await addDoc(collection(db,'transactions'),{userId:u.phone,userName:u.name,userPhone:u.phone,type:'profit',amount:profit,status:'approved',description:'Daily profit — 5% of GHS '+f2(inv.amount),createdAt:serverTimestamp()});
        total+=profit;count++;
      }
    }
    showLoading(false);
    modal('✅','Profit Done!','Credited <strong>GHS '+f2(total)+'</strong> to <strong>'+count+'</strong> active investments.');
    renderOverview();renderInvs();
  }catch(e){showLoading(false);toast('Error running profit','error');console.error(e);}
}

/* ===== SUPPORT CHAT ===== */
async function renderSupport(){
  const el=document.getElementById('supportList');
  el.innerHTML='<div style="padding:2rem;text-align:center;opacity:.4">Loading...</div>';
  try{
    const q=query(collection(db,'support'),where('sender','==','user'));
    const snap=await getDocs(q);
    const msgs=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{
      const at=a.createdAt?.toDate?a.createdAt.toDate():new Date(0);
      const bt=b.createdAt?.toDate?b.createdAt.toDate():new Date(0);
      return bt-at;
    });
    if(!msgs.length){el.innerHTML='<div style="padding:2rem;text-align:center;opacity:.4">No support messages yet.</div>';return;}
    const byUser={};
    msgs.forEach(m=>{if(!byUser[m.userId])byUser[m.userId]=[];byUser[m.userId].push(m);});
    // Get admin replies too
    const rq=query(collection(db,'support'),where('sender','==','admin'));
    const rsnap=await getDocs(rq);
    const replies=rsnap.docs.map(d=>({id:d.id,...d.data()}));
    replies.forEach(m=>{if(!byUser[m.userId])byUser[m.userId]=[];byUser[m.userId].push(m);});
    // Sort each user's messages by time
    Object.keys(byUser).forEach(uid=>{
      byUser[uid].sort((a,b)=>{
        const at=a.createdAt?.toDate?a.createdAt.toDate():new Date(0);
        const bt=b.createdAt?.toDate?b.createdAt.toDate():new Date(0);
        return at-bt;
      });
    });
    const unreadCount=msgs.filter(m=>!m.read).length;
    el.innerHTML=(unreadCount?`<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:.7rem 1rem;margin-bottom:1rem;font-size:.83rem;color:var(--red);max-width:640px;"><strong>${unreadCount} unread message${unreadCount>1?'s':''}</strong> from users</div>`:'')
    +Object.entries(byUser).map(([userId,allMsgs])=>{
      const userMsgs=allMsgs.filter(m=>m.sender==='user');
      const unread=userMsgs.filter(m=>!m.read).length;
      const latest=userMsgs[userMsgs.length-1]||allMsgs[0];
      return`<div class="card" style="margin-bottom:1rem;max-width:640px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.8rem;">
          <div><strong>${latest.userName}</strong><span style="font-size:.78rem;color:var(--dim);margin-left:.5rem;">${latest.userPhone}</span></div>
          ${unread?'<span style="background:rgba(239,68,68,.15);color:var(--red);font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:20px;">'+unread+' unread</span>':'<span style="background:rgba(34,197,94,.12);color:var(--green);font-size:.7rem;padding:2px 8px;border-radius:20px;">read</span>'}
        </div>
        <div id="chat_${userId}" style="background:var(--surface2);border-radius:10px;padding:.8rem;margin-bottom:.7rem;max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:.4rem;">
          ${allMsgs.map(m=>`<div style="display:flex;justify-content:${m.sender==='admin'?'flex-end':'flex-start'};"><div style="max-width:82%;background:${m.sender==='admin'?'var(--accent)':'var(--surface3)'};color:${m.sender==='admin'?'#000':'var(--text)'};padding:.45rem .8rem;border-radius:${m.sender==='admin'?'10px 10px 2px 10px':'10px 10px 10px 2px'};font-size:.8rem;line-height:1.5;">${m.message}<div style="font-size:.62rem;opacity:.5;margin-top:.12rem;">${fdate(m.createdAt)}</div></div></div>`).join('')}
        </div>
        <div style="display:flex;gap:.5rem;">
          <input type="text" id="reply_${userId}" placeholder="Type your reply..." maxlength="300" style="flex:1;background:var(--input-bg);border:1px solid var(--border2);border-radius:8px;padding:.55rem .8rem;color:var(--text);font-size:.82rem;outline:none;" onkeydown="if(event.key==='Enter')sendAdminReply('${userId}','${latest.userName}')"/>
          <button onclick="sendAdminReply('${userId}','${latest.userName}')" class="btn-primary" style="width:auto;padding:.55rem 1rem;">Reply</button>
        </div>
      </div>`;
    }).join('');
    // Mark user messages as read
    for(const m of msgs.filter(m=>!m.read)){
      try{await updateDoc(doc(db,'support',m.id),{read:true});}catch(e){}
    }
  }catch(e){el.innerHTML='<div style="padding:2rem;text-align:center;color:var(--red)">Error loading.</div>';console.error(e);}
}

async function sendAdminReply(userId,userName){
  const input=document.getElementById('reply_'+userId);
  const msg=input?.value.trim();
  if(!msg)return;
  showLoading(true);
  try{
    await addDoc(collection(db,'support'),{userId,userName,userPhone:userId,sender:'admin',message:msg,read:false,createdAt:serverTimestamp()});
    input.value='';
    showLoading(false);toast('✅ Reply sent to '+userName);
    renderSupport();
    smsNote('InvestPro GH: Admin replied to your deposit support message. Open the app to read it.');
  }catch(e){showLoading(false);toast('Error sending reply','error');}
}
window.sendAdminReply=sendAdminReply;

/* ===== SETTINGS ===== */
async function saveVideoLink(){
  const url=document.getElementById('cfgDailyVideoUrl').value.trim();
  const title=document.getElementById('cfgDailyVideoTitle').value.trim()||'Today\'s Investment Insight';
  const date=document.getElementById('cfgDailyVideoDate').value||new Date().toISOString().split('T')[0];
  if(!url){toast('Enter a YouTube URL','error');return;}
  if(!url.includes('youtube.com')&&!url.includes('youtu.be')){toast('Please enter a valid YouTube URL','error');return;}
  showLoading(true);
  const ok=await saveCfg({dailyVideoUrl:url,dailyVideoTitle:title,dailyVideoDate:date});
  showLoading(false);
  if(ok){
    _cfg.dailyVideoUrl=url;_cfg.dailyVideoTitle=title;_cfg.dailyVideoDate=date;
    const msg=document.getElementById('videoSaveMsg');
    if(msg){msg.style.display='block';setTimeout(()=>{msg.style.display='none';},4000);}
    toast('✅ Video posted! Users can now watch to earn today.');
  }else toast('Error saving video','error');
}
window.saveVideoLink=saveVideoLink;
  const s=_cfg;
  document.getElementById('cfgAdminPhone').value   =s.adminPhone||'';
  document.getElementById('cfgArkeselKey').value   =s.arkeselKey||'';
  document.getElementById('cfgArkeselSender').value=s.arkeselSender||'SaxoBank';
  document.getElementById('cfgAdminEmail').value   =s.adminEmail||'';
  document.getElementById('cfgEjsService').value   =s.ejsService||'';
  document.getElementById('cfgEjsTemplate').value  =s.ejsTemplate||'';
  document.getElementById('cfgEjsKey').value       =s.ejsKey||'';
  if(document.getElementById('cfgDailyVideoUrl'))  document.getElementById('cfgDailyVideoUrl').value=s.dailyVideoUrl||'';
  if(document.getElementById('cfgDailyVideoTitle'))document.getElementById('cfgDailyVideoTitle').value=s.dailyVideoTitle||'';
  if(document.getElementById('cfgDailyVideoDate')) document.getElementById('cfgDailyVideoDate').value=s.dailyVideoDate||new Date().toISOString().split('T')[0];
  renderMtnNums();renderTelecelNums();
}

async function saveSettings(){
  const newCfg={
    adminPhone:    document.getElementById('cfgAdminPhone').value.trim(),
    arkeselKey:    document.getElementById('cfgArkeselKey').value.trim(),
    arkeselSender: document.getElementById('cfgArkeselSender').value.trim()||'InvestProGH',
    adminEmail:    document.getElementById('cfgAdminEmail').value.trim(),
    ejsService:    document.getElementById('cfgEjsService').value.trim(),
    ejsTemplate:   document.getElementById('cfgEjsTemplate').value.trim(),
    ejsKey:        document.getElementById('cfgEjsKey').value.trim(),
    mtnNumbers:    _cfg.mtnNumbers||[],
    telecelNumbers:_cfg.telecelNumbers||[],
    paymentNumbers:_cfg.paymentNumbers||[],
    adminPass:     _cfg.adminPass||'admin123',
  };
  showLoading(true);
  const ok=await saveCfg(newCfg);
  showLoading(false);
  if(ok){_cfg={..._cfg,...newCfg};toast('✅ Settings saved to Firebase!');}
  else toast('Error saving','error');
}

function testSMS(){
  const phone=document.getElementById('cfgAdminPhone').value.trim();
  const key=document.getElementById('cfgArkeselKey').value.trim();
  const sender=document.getElementById('cfgArkeselSender').value.trim()||'InvestProGH';
  if(!key||!phone){toast('Enter Arkesel key and phone first','error');return;}
  let p=phone.replace(/\D/g,'');if(p.startsWith('0'))p='233'+p.slice(1);
  fetch('https://sms.arkesel.com/sms/api?action=send-sms&api_key='+encodeURIComponent(key)+'&to='+p+'&from='+encodeURIComponent(sender)+'&sms='+encodeURIComponent('InvestPro GH: ✅ Test SMS successful! Your alerts are working.'))
    .then(()=>toast('Test SMS sent! Check your phone 📱'))
    .catch(()=>toast('SMS failed. Check your API key.','error'));
}

/* MTN NUMBERS */
function renderMtnNums(){
  const nums=_cfg.mtnNumbers||[],el=document.getElementById('mtnNumList');
  if(!nums.length){el.innerHTML='<p style="opacity:.45;font-size:.82rem;margin-bottom:.6rem">No MTN accounts yet.</p>';return;}
  el.innerHTML=nums.map((n,i)=>`<div class="pay-item"><div class="pi-info"><strong>${n.number}</strong><span>${n.name}</span></div><button class="btn-del" onclick="removeMtnNum(${i})">Remove</button></div>`).join('');
}
async function addMtnNum(){
  const num=document.getElementById('newMtnNum').value.trim(),name=document.getElementById('newMtnName').value.trim();
  if(!num||!name){toast('Enter number and label','error');return;}
  const nums=_cfg.mtnNumbers||[];nums.push({number:num,name});_cfg.mtnNumbers=nums;
  showLoading(true);const ok=await saveCfg({mtnNumbers:nums});showLoading(false);
  document.getElementById('newMtnNum').value='';document.getElementById('newMtnName').value='';
  if(ok){renderMtnNums();toast('✅ MTN number added!');}else toast('Error','error');
}
async function removeMtnNum(i){
  const nums=_cfg.mtnNumbers||[];nums.splice(i,1);_cfg.mtnNumbers=nums;
  await saveCfg({mtnNumbers:nums});renderMtnNums();toast('Removed');
}

/* TELECEL NUMBERS */
function renderTelecelNums(){
  const nums=_cfg.telecelNumbers||[],el=document.getElementById('telecelNumList');
  if(!nums.length){el.innerHTML='<p style="opacity:.45;font-size:.82rem;margin-bottom:.6rem">No Telecel accounts yet.</p>';return;}
  el.innerHTML=nums.map((n,i)=>`<div class="pay-item"><div class="pi-info"><strong>${n.number}</strong><span>${n.name}</span></div><button class="btn-del" onclick="removeTelecelNum(${i})">Remove</button></div>`).join('');
}
async function addTelecelNum(){
  const num=document.getElementById('newTelecelNum').value.trim(),name=document.getElementById('newTelecelName').value.trim();
  if(!num||!name){toast('Enter number and label','error');return;}
  const nums=_cfg.telecelNumbers||[];nums.push({number:num,name});_cfg.telecelNumbers=nums;
  showLoading(true);const ok=await saveCfg({telecelNumbers:nums});showLoading(false);
  document.getElementById('newTelecelNum').value='';document.getElementById('newTelecelName').value='';
  if(ok){renderTelecelNums();toast('✅ Telecel number added!');}else toast('Error','error');
}
async function removeTelecelNum(i){
  const nums=_cfg.telecelNumbers||[];nums.splice(i,1);_cfg.telecelNumbers=nums;
  await saveCfg({telecelNumbers:nums});renderTelecelNums();toast('Removed');
}

async function changePass(){
  const p=document.getElementById('newAdminPass').value;
  if(!p||p.length<6){toast('Min. 6 characters','error');return;}
  showLoading(true);const ok=await saveCfg({adminPass:p});showLoading(false);
  if(ok){_cfg.adminPass=p;document.getElementById('newAdminPass').value='';toast('Password updated!');}
  else toast('Error','error');
}

/* SMS helper */
function smsNote(message){
  const s=_cfg;if(!s.arkeselKey||!s.adminPhone)return;
  let p=s.adminPhone.replace(/\D/g,'');if(p.startsWith('0'))p='233'+p.slice(1);
  fetch('https://sms.arkesel.com/sms/api?action=send-sms&api_key='+encodeURIComponent(s.arkeselKey)+'&to='+p+'&from='+encodeURIComponent(s.arkeselSender||'InvestProGH')+'&sms='+encodeURIComponent(message)).catch(e=>console.warn('SMS:',e));
}

/* EXPOSE */
window.adminLogin=adminLogin;window.adminLogout=adminLogout;window.aPage=aPage;window.closeModal=closeModal;
window.fDep=fDep;window.approveDep=approveDep;window.rejectDep=rejectDep;
window.fWdr=fWdr;window.approveWdr=approveWdr;window.rejectWdr=rejectWdr;
window.setBalance=setBalance;window.delUser=delUser;window.runProfitSim=runProfitSim;
window.saveSettings=saveSettings;window.testSMS=testSMS;
window.addMtnNum=addMtnNum;window.removeMtnNum=removeMtnNum;
window.addTelecelNum=addTelecelNum;window.removeTelecelNum=removeTelecelNum;
window.changePass=changePass;

document.addEventListener('DOMContentLoaded',async()=>{
  if(localStorage.getItem('ip_adm')==='1'){
    document.getElementById('adminAuthScreen').style.display='none';
    document.getElementById('adminApp').style.display='block';
    await loadAdmin();
  }
});
