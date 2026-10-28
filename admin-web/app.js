import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';
const CONFIG=globalThis.ZEEROO_ADMIN_CONFIG||{};
const URL='https://rgxesocsvhgsqoehxhgt.supabase.co';
const sections=['setup','login','denied','dashboard'];
const $=(id)=>document.getElementById(id);
let client=null,user=null;
const show=(id)=>{sections.forEach(s=>$(s).hidden=s!==id);globalThis.ZEEROO_NAV?.sync(id)};
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
const titles={overview:'Vue d’ensemble',merchants:'Commerces',couriers:'Livreurs',orders:'Commandes',subscriptions:'Abonnements',disputes:'Litiges',profile:'Mon profil',clients:'Clients',reviews:'Évaluations',loyalty:'Fidélité',offers:'Offres géolocalisées',communications:'Communications et relances',audit:'Journal des actions'};
const PAGE_SIZE=25;
let renderVersion=0;
const dateText=value=>value?new Date(value).toLocaleString('fr-FR'):'—';
const labels={active:'Actif',trialing:'Essai',incomplete:'Incomplet',past_due:'Paiement en retard',canceled:'Résilié',cancelled:'Annulée',unpaid:'Impayé',paused:'En pause',placed:'Passée',accepted:'Acceptée',preparing:'En préparation',ready:'Prête',collected:'Retirée',delivered:'Livrée',out_for_delivery:'En livraison',awaiting_payment:'En attente de paiement',refused:'Refusée',expired:'Expiré'};
const statusText=value=>labels[value]||value||'—';
function node(tag,text){const el=document.createElement(tag);if(text!==undefined)el.textContent=String(text);return el}
function table(headers,rows){
  const wrap=node('div');wrap.className='table-scroll';const t=node('table');const head=node('thead');const tr=node('tr');
  headers.forEach(label=>tr.append(node('th',label)));head.append(tr);t.append(head);const body=node('tbody');
  rows.forEach(row=>{const line=node('tr');row.forEach(value=>{const cell=node('td');if(value&&typeof value==='object'&&value.nodeType)cell.append(value);else cell.textContent=String(value??'—');line.append(cell)});body.append(line)});
  t.append(body);wrap.append(t);return wrap;
}
const detailLabels={id:'Identifiant',owner_id:'Compte propriétaire',user_id:'Compte utilisateur',name:'Nom du commerce',slug:'Adresse de la fiche',display_name:'Nom affiché',email:'E-mail de connexion',phone:'Téléphone',contact_email:'E-mail professionnel',legal_name:'Raison sociale',legal_status:'Statut juridique',siret:'SIRET',vat_number:'Numéro de TVA',category:'Catégorie',description:'Description',address_line:'Adresse',postal_code:'Code postal',city:'Ville',latitude:'Latitude',longitude:'Longitude',timezone:'Fuseau horaire',vehicle:'Véhicule',work_zone:'Zone de travail',is_available:'Disponible',available_until:'Disponible jusqu’au',last_assigned_at:'Dernière attribution',is_published:'Publié',is_paused:'En pause',paused_until:'Pause jusqu’au',created_at:'Création',updated_at:'Mise à jour',email_confirmed_at:'E-mail confirmé le',phone_confirmed_at:'Téléphone confirmé le',last_sign_in_at:'Dernière connexion',banned_until:'Compte suspendu jusqu’au',locale:'Langue',account_space:'Espace du compte',stripe_customer_id:'Client Stripe',stripe_subscription_id:'Abonnement Stripe',stripe_account_id:'Compte Stripe Connect',status:'Statut',plan:'Offre',trial_end:'Fin de l’essai',trial_used:'Essai utilisé',current_period_end:'Fin de la période',cancel_at_period_end:'Résiliation en fin de période',first_paid_at:'Premier paiement enregistré',charges_enabled:'Encaissements activés',payouts_enabled:'Virements activés',details_submitted:'Dossier Stripe transmis',orders_count:'Commandes associées',last_order_at:'Dernière commande',delivery_enabled:'Livraison activée',delivery_fee_cents:'Frais de livraison',delivery_radius_m:'Rayon de livraison (m)',accepts_cash_pickup:'Espèces au retrait',offers_pickup:'Retrait proposé',pickup_instructions:'Instructions de retrait',default_prep_minutes:'Préparation par défaut (min)',payment_link:'Lien de paiement',photo_url:'URL de la photo',logo_url:'URL du logo',tagline:'Accroche',about:'Présentation',accent_color:'Couleur',group_orders_enabled:'Commandes groupées activées',group_min_lead_hours:'Délai minimum groupe (h)',group_min_headcount:'Effectif minimum groupe',group_min_total_cents:'Minimum commande groupée',marketing_consent:'Consentement marketing',marketing_consent_at:'Date du consentement'};
function detailValue(key,value){
  if(value===null||value===undefined||value==='')return 'Non renseigné';
  if(typeof value==='boolean')return value?'Oui':'Non';
  if(/(_at|_until|_end)$/.test(key)&&typeof value==='string')return dateText(value);
  if(key.endsWith('_cents'))return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(value/100);
  if(key==='status')return statusText(value);
  return String(value);
}
async function subscriberDetails(panel,kind,id,fresh){
  panel.replaceChildren(node('p','Chargement de la fiche abonné…'));panel.hidden=false;
  const close=node('button','Fermer la fiche');close.type='button';let closed=false;close.onclick=()=>{closed=true;panel.replaceChildren();panel.hidden=true};panel.prepend(close);
  try{
    const {data,error}=await client.rpc('admin_subscriber_details',{p_kind:kind,p_id:id});
    if(error)throw error;if(!fresh()||closed)return;if(!data?.entity)throw new Error('Abonné introuvable');
    const title=node('h3',data.entity.name||data.entity.display_name||'Fiche abonné');title.tabIndex=-1;
    panel.replaceChildren(close,title,node('p','Informations enregistrées dans ZEEROO · Lecture seule · '+dateText(new Date())));
    const groups=[['entity',kind==='merchant'?'Commerce et informations professionnelles':'Livreur et informations professionnelles'],['account','Compte de connexion'],['profile','Profil utilisateur'],['subscription','Abonnement'],['payments','État des paiements Stripe Connect'],['activity','Activité']];
    groups.forEach(([key,label])=>{
      const section=node('section');section.append(node('h4',label));const value=data[key];
      if(!value)section.append(node('p','Aucune information enregistrée.'));
      else{const dl=node('dl');dl.className='subscriber-fields';Object.entries(value).forEach(([field,val])=>{if(!detailLabels[field])return;const pair=node('div');pair.append(node('dt',detailLabels[field]),node('dd',detailValue(field,val)));dl.append(pair)});section.append(dl)}
      panel.append(section);
    });if(globalThis.ZEEROO_CRM)await globalThis.ZEEROO_CRM.actions(panel,kind,id,data,client,()=>fresh()&&!closed);title.focus();
  }catch(error){if(fresh()&&!closed)panel.replaceChildren(close,node('p','Fiche inaccessible : '+errorText(error)))}
}

const lists={
  merchants:{table:'merchants',select:'id,name,city,category,is_published,is_paused,created_at,admin_status',order:'created_at',headers:['Commerce','Ville','Catégorie','Publication','Activité','Inscription','État admin'],row:r=>[r.name,r.city,r.category,r.is_published?'Publié':'Non publié',r.is_paused?'En pause':'Ouvert',dateText(r.created_at),r.admin_status||'active']},
  couriers:{table:'couriers',select:'id,display_name,vehicle,work_zone,is_available,created_at,admin_status',order:'created_at',headers:['Livreur','Véhicule','Zone','Disponibilité','Inscription','État admin'],row:r=>[r.display_name,r.vehicle,r.work_zone,r.is_available?'Disponible':'Indisponible',dateText(r.created_at),r.admin_status||'active']},
  orders:{table:'orders',select:'id,customer_name,merchant_id,status,total_cents,currency,fulfillment,created_at,paid_at',order:'created_at',headers:['Commande','Client','Commerce','Statut','Total commande','Paiement enregistré','Création'],row:r=>[r.id.slice(0,8),r.customer_name,r.merchants?.name||r.merchant_id,statusText(r.status),new Intl.NumberFormat('fr-FR',{style:'currency',currency:(r.currency||'EUR').trim()}).format(r.total_cents/100),r.paid_at?dateText(r.paid_at):'Non',dateText(r.created_at)]},
  merchantSubscriptions:{table:'subscriptions',select:'merchant_id,status,plan,current_period_end,cancel_at_period_end',order:'merchant_id',headers:['Commerce','Offre','Statut','Fin de période','Résiliation prévue'],row:r=>[r.merchants?.name||r.merchant_id,r.plan,statusText(r.status),dateText(r.current_period_end),r.cancel_at_period_end?'Oui':'Non']},
  courierSubscriptions:{table:'courier_subscriptions',select:'courier_id,status,plan,current_period_end,cancel_at_period_end',order:'courier_id',headers:['Livreur','Offre','Statut','Fin de période','Résiliation prévue'],row:r=>[r.couriers?.display_name||r.courier_id,r.plan,statusText(r.status),dateText(r.current_period_end),r.cancel_at_period_end?'Oui':'Non']},
};
async function renderData(content,tab,version){
  const fresh=()=>version===renderVersion&&user&&!$('dashboard').hidden;
  if(['clients','reviews','loyalty','offers','disputes','communications','audit'].includes(tab)&&globalThis.ZEEROO_CRM)return globalThis.ZEEROO_CRM.render({content,tab,client,fresh});
  if(['merchants','couriers'].includes(tab)&&globalThis.ZEEROO_CRM)globalThis.ZEEROO_CRM.addEntity(content,tab==='merchants'?'merchant':'courier',client,()=>renderTab(tab));
  const refresh=node('button','Actualiser');refresh.type='button';refresh.onclick=()=>renderTab(tab);content.append(refresh);
  if(tab==='disputes'){content.append(node('p','Le suivi des litiges n’est pas encore connecté : aucune source de litiges n’est enregistrée dans la base ZEEROO. Les litiges Stripe ne sont pas synchronisés ici.'));return}
  if(tab==='overview'){
    const specs=[['Commerces','merchants','id'],['Commerces publiés','merchants','id','is_published',true],['Livreurs','couriers','id'],['Commandes','orders','id'],['Abonnements commerces','subscriptions','merchant_id'],['Abonnements livreurs','courier_subscriptions','courier_id']];
    const results=await Promise.all(specs.map(async([label,name,key,filter,value])=>{let q=client.from(name).select(key,{count:'exact',head:true});if(filter)q=q.eq(filter,value);const result=await q;if(result.error)throw result.error;return [label,result.count]}));
    if(!fresh())return;
    const grid=node('div');grid.className='metrics';results.forEach(([label,count])=>{const card=node('div');card.className='metric';card.append(node('strong',count??'Indisponible'),node('span',label));grid.append(card)});content.append(grid,node('p','Compteurs issus de la base ZEEROO, tous statuts confondus sauf indication contraire.'));
    content.append(node('p','Dernière lecture : '+dateText(new Date())));
    const recent=node('section');recent.className='recent-orders';recent.append(node('h3','Dernières commandes'));content.append(recent);
    try{
      const config=lists.orders;
      const {data,error}=await client.from('orders').select(config.select+',merchants(name)').order('created_at',{ascending:false}).range(0,4);
      if(error)throw error;if(!fresh())return;
      if(data?.length)recent.append(table(['Commande','Client / commerce','Montant','Statut'],data.map(r=>[r.id.slice(0,8),[r.customer_name,r.merchants?.name||r.merchant_id].filter(Boolean).join(' → '),new Intl.NumberFormat('fr-FR',{style:'currency',currency:(r.currency||'EUR').trim()}).format(r.total_cents/100),statusText(r.status)])));
      else recent.append(node('p','Aucune commande enregistrée pour le moment.'));
      const all=node('button','Voir toutes les commandes');all.type='button';all.onclick=()=>renderTab('orders');recent.append(all);
    }catch(error){if(fresh())recent.append(node('p','Commandes indisponibles : '+errorText(error)))}
    return;
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
      const detailPanel=node('aside');detailPanel.className='subscriber-detail';detailPanel.hidden=true;
      const canDetail=['merchants','couriers','merchantSubscriptions','courierSubscriptions'].includes(kind);
      const detailKind=(kind==='merchants'||kind==='merchantSubscriptions')?'merchant':'courier';let detailRequest=0;
      const rows=(data||[]).map(record=>{const cells=config.row(record);if(canDetail){const button=node('button','Voir la fiche');button.type='button';const id=record.id||record.merchant_id||record.courier_id;button.onclick=()=>{const detailCurrent=++detailRequest;return subscriberDetails(detailPanel,detailKind,id,()=>fresh()&&current===request&&detailCurrent===detailRequest)};cells.unshift(button)}return cells});
      if(data?.length)region.append(table(canDetail?['Informations',...config.headers]:config.headers,rows));else region.append(node('p','Aucun enregistrement dans cette rubrique.'));
      const nav=node('div');nav.className='pagination';const previous=node('button','Précédent');previous.disabled=page===0;previous.onclick=()=>load(page-1);const next=node('button','Suivant');next.disabled=count!=null?(page+1)*PAGE_SIZE>=count:(data?.length||0)<PAGE_SIZE;next.onclick=()=>load(page+1);nav.append(previous,node('span',`Page ${page+1}`),next);region.append(nav,detailPanel);
    }catch(error){if(fresh()&&current===request)region.replaceChildren(node('p','Lecture impossible : '+errorText(error)))}
  }
  await load(0);
}

async function renderTab(tab){
  if($('dashboard').hidden||!user)return;
  globalThis.ZEEROO_NAV?.select(tab,titles[tab]);
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