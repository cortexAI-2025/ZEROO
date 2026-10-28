import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';
const CONFIG=globalThis.ZEEROO_ADMIN_CONFIG||{};
const URL='https://rgxesocsvhgsqoehxhgt.supabase.co';
const sections=['setup','login','denied','dashboard'];
const $=(id)=>document.getElementById(id);
let client=null,user=null;
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
  $('identity').textContent=user.email||'Administrateur';
  show('dashboard');await renderTab('overview');
}
$('login-form').onsubmit=async(e)=>{e.preventDefault();$('login-error').textContent='';const f=new FormData(e.target);const {error}=await client.auth.signInWithPassword({email:String(f.get('email')),password:String(f.get('password'))});if(error){$('login-error').textContent=errorText(error);return}await verify()};
const titles={overview:'Vue d’ensemble',merchants:'Commerces',couriers:'Livreurs',orders:'Commandes',subscriptions:'Abonnements',disputes:'Litiges',profile:'Mon profil'};
const PAGE_SIZE=25;
let renderVersion=0;
const dateText=value=>value?new Date(value).toLocaleString('fr-FR'):'—';
const labels={active:'Actif',trialing:'Essai',incomplete:'Incomplet',past_due:'Paiement en retard',canceled:'Résilié',cancelled:'Annulée',unpaid:'Impayé',paused:'En pause',placed:'Passée',accepted:'Acceptée',preparing:'En préparation',ready:'Prête',collected:'Retirée',delivered:'Livrée',out_for_delivery:'En livraison',awaiting_payment:'En attente de paiement',refused:'Refusée',expired:'Expiré'};
const statusText=value=>labels[value]||value||'—';
function node(tag,text){const el=document.createElement(tag);if(text!==undefined)el.textContent=String(text);return el}
function table(headers,rows){
  const wrap=node('div');wrap.className='table-scroll';const t=node('table');const head=node('thead');const tr=node('tr');
  headers.forEach(label=>tr.append(node('th',label)));head.append(tr);t.append(head);const body=node('tbody');
  rows.forEach(row=>{const line=node('tr');row.forEach(value=>line.append(node('td',value??'—')));body.append(line)});
  t.append(body);wrap.append(t);return wrap;
}
const lists={
  merchants:{table:'merchants',select:'id,name,city,category,is_published,is_paused,created_at',order:'created_at',headers:['Commerce','Ville','Catégorie','Publication','Activité','Inscription'],row:r=>[r.name,r.city,r.category,r.is_published?'Publié':'Non publié',r.is_paused?'En pause':'Ouvert',dateText(r.created_at)]},
  couriers:{table:'couriers',select:'id,display_name,vehicle,work_zone,is_available,created_at',order:'created_at',headers:['Livreur','Véhicule','Zone','Disponibilité','Inscription'],row:r=>[r.display_name,r.vehicle,r.work_zone,r.is_available?'Disponible':'Indisponible',dateText(r.created_at)]},
  orders:{table:'orders',select:'id,customer_name,merchant_id,status,total_cents,currency,fulfillment,created_at,paid_at',order:'created_at',headers:['Commande','Client','Commerce','Statut','Total commande','Paiement enregistré','Création'],row:r=>[r.id.slice(0,8),r.customer_name,r.merchants?.name||r.merchant_id,statusText(r.status),new Intl.NumberFormat('fr-FR',{style:'currency',currency:(r.currency||'EUR').trim()}).format(r.total_cents/100),r.paid_at?dateText(r.paid_at):'Non',dateText(r.created_at)]},
  merchantSubscriptions:{table:'subscriptions',select:'merchant_id,status,plan,current_period_end,cancel_at_period_end',order:'merchant_id',headers:['Commerce','Offre','Statut','Fin de période','Résiliation prévue'],row:r=>[r.merchants?.name||r.merchant_id,r.plan,statusText(r.status),dateText(r.current_period_end),r.cancel_at_period_end?'Oui':'Non']},
  courierSubscriptions:{table:'courier_subscriptions',select:'courier_id,status,plan,current_period_end,cancel_at_period_end',order:'courier_id',headers:['Livreur','Offre','Statut','Fin de période','Résiliation prévue'],row:r=>[r.couriers?.display_name||r.courier_id,r.plan,statusText(r.status),dateText(r.current_period_end),r.cancel_at_period_end?'Oui':'Non']},
};
async function renderData(content,tab,version){
  const fresh=()=>version===renderVersion&&user&&!$('dashboard').hidden;
  const refresh=node('button','Actualiser');refresh.type='button';refresh.onclick=()=>renderTab(tab);content.append(refresh);
  if(tab==='disputes'){content.append(node('p','Le suivi des litiges n’est pas encore connecté : aucune source de litiges n’est enregistrée dans la base ZEEROO. Les litiges Stripe ne sont pas synchronisés ici.'));return}
  if(tab==='overview'){
    const specs=[['Commerces','merchants','id'],['Commerces publiés','merchants','id','is_published',true],['Livreurs','couriers','id'],['Commandes','orders','id'],['Abonnements commerces','subscriptions','merchant_id'],['Abonnements livreurs','courier_subscriptions','courier_id']];
    const results=await Promise.all(specs.map(async([label,name,key,filter,value])=>{let q=client.from(name).select(key,{count:'exact',head:true});if(filter)q=q.eq(filter,value);const result=await q;if(result.error)throw result.error;return [label,result.count]}));
    if(!fresh())return;
    const grid=node('div');grid.className='metrics';results.forEach(([label,count])=>{const card=node('div');card.className='metric';card.append(node('strong',count??'Indisponible'),node('span',label));grid.append(card)});content.append(grid,node('p','Compteurs issus de la base ZEEROO, tous statuts confondus sauf indication contraire.'));
    content.append(node('p','Dernière lecture : '+dateText(new Date())));return;
  }
  let kind=tab;
  if(tab==='subscriptions'){
    const label=node('label','Type d’abonnement');const select=node('select');
    [['merchantSubscriptions','Commerces'],['courierSubscriptions','Livreurs']].forEach(([value,text])=>{const option=node('option',text);option.value=value;select.append(option)});
    kind='merchantSubscriptions';select.value=kind;label.append(select);content.append(label);select.onchange=()=>{kind=select.value;load(0)};
  }
  const region=node('div');region.setAttribute('aria-live','polite');content.append(region);let request=0;
  async function load(page){
    const current=++request;const config=lists[kind];region.replaceChildren(node('p','Chargement des données…'));
    try{
      const relation=kind==='orders'||kind==='merchantSubscriptions'?',merchants(name)':kind==='courierSubscriptions'?',couriers(display_name)':'';
      const {data,error,count}=await client.from(config.table).select(config.select+relation,{count:'exact'}).order(config.order,{ascending:false}).range(page*PAGE_SIZE,(page+1)*PAGE_SIZE-1);
      if(error)throw error;if(!fresh()||current!==request)return;
      region.replaceChildren(node('p',`${count??'—'} enregistrement(s) · Dernière lecture : ${dateText(new Date())}`));
      if(data?.length)region.append(table(config.headers,data.map(config.row)));else region.append(node('p','Aucun enregistrement dans cette rubrique.'));
      const nav=node('div');nav.className='pagination';const previous=node('button','Précédent');previous.disabled=page===0;previous.onclick=()=>load(page-1);const next=node('button','Suivant');next.disabled=count!=null?(page+1)*PAGE_SIZE>=count:(data?.length||0)<PAGE_SIZE;next.onclick=()=>load(page+1);nav.append(previous,node('span',`Page ${page+1}`),next);region.append(nav);
    }catch(error){if(fresh()&&current===request)region.replaceChildren(node('p','Lecture impossible : '+errorText(error)))}
  }
  await load(0);
}

async function renderTab(tab){
  if($('dashboard').hidden||!user)return;
  const version=++renderVersion;
  document.querySelectorAll('#tabs button').forEach(b=>b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false'));
  const content=$('content');content.replaceChildren();
  const title=document.createElement('h2');title.textContent=titles[tab]||tab;content.append(title);
  if(tab!=='profile'){try{await renderData(content,tab,version)}catch(error){if(version===renderVersion)content.append(node('p','Lecture impossible : '+errorText(error)))}return}
  const {data,error}=await client.from('admin_profiles').select('display_name,locale,theme,avatar_url').eq('user_id',user.id).maybeSingle();
  if(version!==renderVersion||!user||$('dashboard').hidden)return;
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