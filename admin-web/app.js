import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';
const CONFIG=globalThis.ZEEROO_ADMIN_CONFIG||{};
const URL='https://rgxesocsvhgsqoehxhgt.supabase.co';
const sections=['setup','login','mfa','enroll','denied','dashboard'];
const $=(id)=>document.getElementById(id);
let client=null,user=null,pendingEnrollment=null;
const show=(id)=>sections.forEach(s=>$(s).hidden=s!==id);
const prefers=matchMedia('(prefers-color-scheme: dark)');
let theme='system';
try{theme=localStorage.getItem('zeeroo-admin-theme')||'system'}catch{}
function applyTheme(){const dark=theme==='dark'||(theme==='system'&&prefers.matches);document.documentElement.dataset.theme=dark?'dark':'light';$('theme').textContent=theme==='system'?'◐ Auto':theme==='dark'?'☾ Sombre':'☀ Clair'}
$('theme').onclick=()=>{theme=theme==='system'?'light':theme==='light'?'dark':'system';try{localStorage.setItem('zeeroo-admin-theme',theme)}catch{}applyTheme()};
prefers.addEventListener?.('change',()=>{if(theme==='system')applyTheme()});applyTheme();
const logout=async()=>{try{await client?.auth.signOut()}catch{}user=null;$('logout').hidden=true;show('login')};
$('logout').onclick=logout;
function errorText(error){return error?.message||'Une erreur est survenue.'}
async function verify(){
  if(!client)return show('setup');
  const {data,error}=await client.auth.getUser();
  if(error||!data?.user){user=null;$('logout').hidden=true;return show('login')}
  user=data.user;$('logout').hidden=false;
  // Only own membership can be read; a missing row denies access.
  const {data:membership,error:membershipError}=await client.from('platform_admins').select('user_id').eq('user_id',user.id).maybeSingle();
  if(membershipError||!membership)return show('denied');
  const {data:aal,error:aalError}=await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if(aalError)return show('denied');if(aal?.currentLevel!=='aal2'){const {data:factors,error:factorsError}=await client.auth.mfa.listFactors();if(factorsError)return show('denied');if(!factors?.totp?.some(f=>f.status==='verified')){const {data:enrolled,error:enrollError}=await client.auth.mfa.enroll({factorType:'totp',friendlyName:'ZeeROO Admin'});if(enrollError||!enrolled)return show('denied');pendingEnrollment=enrolled;$('enroll-qr').replaceChildren();const qr=document.createElement('img');qr.src=enrolled.totp.qr_code;qr.alt='QR code de configuration TOTP';qr.width=190;qr.height=190;$('enroll-qr').append(qr);return show('enroll')}return show('mfa')}
  $('identity').textContent=user.email||'Administrateur';
  show('dashboard');await renderTab('overview');
}
$('login-form').onsubmit=async(e)=>{e.preventDefault();$('login-error').textContent='';const f=new FormData(e.target);const {error}=await client.auth.signInWithPassword({email:String(f.get('email')),password:String(f.get('password'))});if(error){$('login-error').textContent=errorText(error);return}await verify()};
$('enroll-form').onsubmit=async(e)=>{e.preventDefault();$('enroll-error').textContent='';if(!pendingEnrollment)return show('denied');const code=String(new FormData(e.target).get('code'));const {data:challenge,error:challengeError}=await client.auth.mfa.challenge({factorId:pendingEnrollment.id});if(challengeError)return $('enroll-error').textContent=errorText(challengeError);const {error}=await client.auth.mfa.verify({factorId:pendingEnrollment.id,challengeId:challenge.id,code});if(error)return $('enroll-error').textContent=errorText(error);pendingEnrollment=null;await verify()};
$('mfa-form').onsubmit=async(e)=>{e.preventDefault();$('mfa-error').textContent='';const {data:factors,error}=await client.auth.mfa.listFactors();if(error)return $('mfa-error').textContent=errorText(error);const factor=factors?.totp?.find(f=>f.status==='verified');if(!factor)return $('mfa-error').textContent='Aucun facteur TOTP vérifié. Configurez-le dans votre compte avant de continuer.';const {error:challengeError,data:challenge}=await client.auth.mfa.challenge({factorId:factor.id});if(challengeError)return $('mfa-error').textContent=errorText(challengeError);const code=String(new FormData(e.target).get('code'));const {error:verifyError}=await client.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code});if(verifyError)return $('mfa-error').textContent=errorText(verifyError);await verify()};
const titles={overview:'Vue d’ensemble',merchants:'Commerces',couriers:'Livreurs',orders:'Commandes',subscriptions:'Abonnements',disputes:'Litiges',profile:'Mon profil'};
async function renderTab(tab){
  if($('dashboard').hidden||!user)return;
  document.querySelectorAll('#tabs button').forEach(b=>b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false'));
  const content=$('content');content.replaceChildren();
  const title=document.createElement('h2');title.textContent=titles[tab]||tab;content.append(title);
  if(tab!=='profile'){const note=document.createElement('p');note.textContent='Données réelles non connectées : ce module sera activé après vérification de son schéma, des permissions et des politiques RLS. Aucune donnée de démonstration n’est affichée ici.';content.append(note);return}
  const {data,error}=await client.from('admin_profiles').select('display_name,locale,theme,avatar_url').eq('user_id',user.id).maybeSingle();
  if(error){const p=document.createElement('p');p.textContent='Profil inaccessible : '+errorText(error);content.append(p);return}
  const form=document.createElement('form');
  const fields=[['display_name','Nom affiché','text',data?.display_name||''],['locale','Langue','text',data?.locale||'fr'],['theme','Thème','text',data?.theme||'system']];
  for(const [name,label,type,value] of fields){const l=document.createElement('label');l.textContent=label;const input=document.createElement('input');input.name=name;input.type=type;input.value=value;input.maxLength=80;l.append(input);form.append(l)}
  const save=document.createElement('button');save.textContent='Enregistrer le profil';form.append(save);const status=document.createElement('p');status.setAttribute('role','status');form.append(status);
  form.onsubmit=async(e)=>{e.preventDefault();const f=new FormData(form);const locale=String(f.get('locale'));const pref=String(f.get('theme'));if(!['fr','en','ar'].includes(locale)||!['system','light','dark'].includes(pref))return status.textContent='Langue ou thème invalide.';const {error}=await client.from('admin_profiles').upsert({user_id:user.id,display_name:String(f.get('display_name')).slice(0,80),locale,theme:pref,updated_at:new Date().toISOString()},{onConflict:'user_id'});status.textContent=error?errorText(error):'Profil enregistré.';if(!error){theme=pref;try{localStorage.setItem('zeeroo-admin-theme',theme)}catch{}applyTheme()}};
  content.append(form);
}
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>renderTab(b.dataset.tab));
if(!CONFIG.supabasePublishableKey||typeof CONFIG.supabasePublishableKey!=='string'){show('setup')}else{
  client=createClient(URL,CONFIG.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){user=null;$('logout').hidden=true;queueMicrotask(()=>show('login'))}});
  verify().catch(()=>show('denied'));
}