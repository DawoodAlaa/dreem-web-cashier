import{Q as S,aF as L,aG as V,U as Q,aH as G,aI as U,W as P,j as e,P as J,B as g,A as K,af as D,S as W,e as z,aJ as X,T as u,a4 as $,$ as B,O as q,a0 as y,D as I,p as w,h as Y,y as Z,G as N,a8 as F,aK as ee,aL as ne,aM as M,aN as te}from"./index-k0n2JlLd.js";import{b as r}from"./vendor-T_9wQwNq.js";import{P as ae}from"./ProductPicker-Bwf2Hfqu.js";import{R as se}from"./rotate-ccw-DLWSqLjc.js";import"./supabase-DYxuN0_g.js";/**
 * @license lucide-react v1.59.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const O={name:"clipboard-copy",size:24,node:[["rect",{width:"8",height:"4",x:"8",y:"2",rx:"1",ry:"1",key:"tgr4d6"}],["path",{d:"M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",key:"4jdomd"}],["path",{d:"M16 4h2a2 2 0 0 1 2 2v4",key:"3hqy98"}],["path",{d:"M21 14H11",key:"1bme5i"}],["path",{d:"m15 10-4 4 4 4",key:"5dvupr"}]]};O.node;const oe=S(O);/**
 * @license lucide-react v1.59.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const A={name:"package-x",size:24,node:[["path",{d:"M12 22V12",key:"d0xqtd"}],["path",{d:"m16.5 14.5 5 5",key:"ozpm51"}],["path",{d:"m16.5 19.5 5-5",key:"syf6b9"}],["path",{d:"M21 10.5V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l.13-.074",key:"isw6gs"}],["path",{d:"M3.29 7 12 12l8.71-5",key:"19ckod"}],["path",{d:"m7.5 4.27 8.997 5.148",key:"9yrvtv"}]]};A.node;const re=S(A);/**
 * @license lucide-react v1.59.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const R={name:"share-2",size:24,node:[["circle",{cx:"18",cy:"5",r:"3",key:"gq8acd"}],["circle",{cx:"6",cy:"12",r:"3",key:"w7nqdw"}],["circle",{cx:"18",cy:"19",r:"3",key:"1xt0gg"}],["line",{x1:"8.59",x2:"15.42",y1:"13.51",y2:"17.49",key:"47mynk"}],["line",{x1:"15.41",x2:"8.59",y1:"6.51",y2:"10.49",key:"1n3mei"}]]};R.node;const ie=S(R),le=`-- ═══════════════════════════════════════════════════════════════════
-- 09: النواقص — قايمة الحاجات اللي محتاجة تتجاب
-- المنتجات اللي كميتها خلصت بتظهر في الموقع لوحدها، والجدول ده للي الكاشير بيضيفه بإيده
-- (مثلاً منتج لسه متجردش وخلص، أو حاجة الزبون طلبها ومش موجودة عندنا خالص).
-- آمن يتنفذ أكتر من مرة. بيتنفذ بعد 01 … 08.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists shortages (
  id bigint generated always as identity primary key,
  shop_id uuid not null default my_shop() references shops on delete cascade,
  product_id bigint references products on delete set null,
  name text not null,
  note text,
  user_name text,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists shortages_shop on shortages (shop_id, done);

alter table shortages enable row level security;
drop policy if exists shop_read on shortages;
create policy shop_read on shortages for select using (shop_id = my_shop());

-- مين يقدر يستخدم النواقص: أي حد بيبيع أو بيتعامل مع المخزون والمشتريات
create or replace function _require_shortages() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if my_shop() is null then raise exception 'حسابك لسه مش متفعّل. استنى المدير يفعّله'; end if;
  if not (has_perm('sell') or has_perm('products') or has_perm('stock') or has_perm('purchases')) then
    raise exception 'مش مسموحلك تعمل: النواقص. اطلب الصلاحية من المدير';
  end if;
end $$;

-- إضافة للنواقص: من منتج موجود (p_product) أو باسم حر (p_name). لو المنتج موجود في القايمة بالفعل مش بيتكرر.
create or replace function shortage_add(p_product bigint, p_name text, p_note text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_name text; v_id bigint;
begin
  perform _require_shortages();
  if p_product is not null then
    select name into v_name from products where id = p_product and shop_id = my_shop();
    if v_name is null then raise exception 'المنتج مش موجود'; end if;
    select id into v_id from shortages where shop_id = my_shop() and product_id = p_product and not done limit 1;
    if v_id is not null then
      if _t(p_note) is not null then update shortages set note = _t(p_note) where id = v_id; end if;
      return v_id;
    end if;
  else
    v_name := _t(p_name);
    if v_name is null then raise exception 'اكتب اسم الحاجة الناقصة'; end if;
  end if;
  insert into shortages (shop_id, product_id, name, note, user_name)
  values (my_shop(), p_product, v_name, _t(p_note), _me_name()) returning id into v_id;
  perform _log('shortage_add', 'النواقص', 'إضافة للنواقص', 'تم إضافة ' || v_name || ' للنواقص',
    _d('المنتج', v_name, 'ملاحظات', _t(p_note)), false);
  return v_id;
end $$;

-- اتجاب / رجّعه للقايمة
create or replace function shortage_done(p_id bigint, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
declare s shortages;
begin
  perform _require_shortages();
  update shortages set done = p_done, done_at = case when p_done then now() end
  where id = p_id and shop_id = my_shop() returning * into s;
  if not found then raise exception 'الحاجة دي مش في النواقص'; end if;
  if p_done then
    perform _log('shortage_done', 'النواقص', 'اتجاب من النواقص', 'تم تعليم ' || s.name || ' إنه اتجاب', null, false);
  end if;
end $$;

create or replace function shortage_delete(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  perform _require_shortages();
  delete from shortages where id = p_id and shop_id = my_shop() returning name into v_name;
  if v_name is null then raise exception 'الحاجة دي مش في النواقص'; end if;
end $$;

-- مسح اللي اتجاب كله مرة واحدة
create or replace function shortage_clear_done() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform _require_shortages();
  delete from shortages where shop_id = my_shop() and done;
  get diagnostics n = row_count;
  return n;
end $$;

-- الصلاحيات
revoke execute on function _require_shortages() from public;
revoke execute on function shortage_add(bigint, text, text) from public;
revoke execute on function shortage_done(bigint, boolean) from public;
revoke execute on function shortage_delete(bigint) from public;
revoke execute on function shortage_clear_done() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function _require_shortages() from anon, authenticated';
    execute 'revoke all on table shortages from anon';
    execute 'revoke insert, update, delete, truncate on table shortages from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select on table shortages to authenticated';
    execute 'grant execute on function shortage_add(bigint, text, text) to authenticated';
    execute 'grant execute on function shortage_done(bigint, boolean) to authenticated';
    execute 'grant execute on function shortage_delete(bigint) to authenticated';
    execute 'grant execute on function shortage_clear_done() to authenticated';
  end if;
end $$;

-- التحديث اللحظي
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'shortages') then
    alter publication supabase_realtime add table shortages;
  end if;
end $$;
`;function ge(){const{ready:t,missing:a,list:c}=L(),i=V(),d=Q(n=>n.byId),h=G(U(n=>n.profile)),[f,_]=r.useState(""),[b,k]=r.useState("open"),[v,j]=r.useState(!1),s=c.filter(n=>!n.done),p=c.filter(n=>n.done),l=new Set(s.filter(n=>n.product_id).map(n=>n.product_id)),m=i.filter(n=>!l.has(n.pv.p.id)),C=P(f),x=n=>!C||P(n).includes(C),E=()=>{const n=[...s.map(o=>`• ${o.name}${o.note?` (${o.note})`:""}`),...m.map(o=>`• ${o.pv.p.name}${o.colors.length?` — ${o.colors.join("، ")}`:""}`)];return`النواقص (${n.length}):
${n.join(`
`)}`},H=async()=>{const n=E();try{navigator.share?await navigator.share({text:n}):(await navigator.clipboard.writeText(n),y("تم نسخ القايمة. الزقها في واتساب"))}catch{}};return e.jsxs("div",{className:"mx-auto max-w-3xl",children:[e.jsx(J,{title:"النواقص",sub:"الحاجات اللي خلصت ومحتاجة تتجاب",actions:e.jsxs(e.Fragment,{children:[e.jsx(g,{icon:e.jsx(K,{className:"h-5 w-5"}),onClick:()=>j(!0),disabled:!t,children:"إضافة"}),e.jsx(g,{variant:"outline",icon:e.jsx(ie,{className:"h-5 w-5"}),onClick:H,disabled:!s.length&&!m.length,children:"مشاركة القايمة"})]})}),a&&e.jsx(de,{owner:h}),e.jsxs("div",{className:"mb-3 flex flex-wrap gap-2",children:[e.jsx("div",{className:"w-full sm:w-72",children:e.jsx(D,{value:b,onChange:k,options:[{value:"open",label:`محتاجة تتجاب (${s.length+m.length})`},{value:"done",label:`اتجابت (${p.length})`}]})}),e.jsx(W,{value:f,onChange:_,className:"min-w-[200px] flex-1"})]}),b==="open"?e.jsxs(e.Fragment,{children:[s.length+m.length===0&&e.jsx(z,{icon:e.jsx(X,{}),text:"مفيش نواقص. كل حاجة موجودة"}),s.filter(n=>x(n.name+" "+(n.note??""))).length>0&&e.jsxs("div",{className:"mb-4",children:[e.jsx("div",{className:"mb-2 font-extrabold",children:"اتضافت للنواقص"}),e.jsx("div",{className:"space-y-2",children:s.filter(n=>x(n.name+" "+(n.note??""))).map(n=>e.jsx(T,{s:n,pv:n.product_id?d.get(n.product_id):void 0},n.id))})]}),m.filter(n=>x(n.pv.p.name)).length>0&&e.jsxs("div",{children:[e.jsxs("div",{className:"mb-2 flex items-center gap-2 font-extrabold",children:["خلصت من المخزون ",e.jsx("span",{className:"text-xs font-bold text-ink-3",children:"(بتظهر لوحدها لما الكمية توصل صفر)"})]}),e.jsx("div",{className:"space-y-2",children:m.filter(n=>x(n.pv.p.name)).map(n=>e.jsxs("div",{className:"card flex items-center gap-3 p-3",children:[e.jsx("span",{className:"flex h-10 w-10 shrink-0 items-center justify-center rounded-btn bg-red-light text-red",children:e.jsx(re,{className:"h-5 w-5"})}),e.jsxs("div",{className:"min-w-0 flex-1",children:[e.jsx("div",{className:"truncate font-bold",children:n.pv.p.name}),e.jsxs("div",{className:"flex flex-wrap gap-1 text-xs",children:[n.colors.length?n.colors.map(o=>e.jsxs(u,{color:"red",children:[o," خلص"]},o)):e.jsx(u,{color:"red",children:"الكمية 0"}),n.pv.hasVariants&&!n.pv.outOfStock&&e.jsxs(u,{color:"gray",children:["باقي ألوان تانية ",n.pv.stock]})]})]})]},n.pv.p.id))})]})]}):e.jsx(e.Fragment,{children:p.length===0?e.jsx(z,{icon:e.jsx($,{}),text:"مفيش حاجة اتعلّمت إنها اتجابت"}):e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"mb-2 flex justify-end",children:e.jsx(g,{variant:"ghost",size:"sm",icon:e.jsx(I,{className:"h-4 w-4"}),onClick:async()=>{if(!await B({title:"مسح اللي اتجاب",message:`هيتمسح ${p.length} من القايمة`,ok:"مسح",danger:!0}))return;let n=0;await q(async()=>n=await ne())&&y(`تم مسح ${n}`)},children:"مسح اللي اتجاب"})}),e.jsx("div",{className:"space-y-2",children:p.filter(n=>x(n.name)).map(n=>e.jsx(T,{s:n,pv:n.product_id?d.get(n.product_id):void 0},n.id))})]})}),v&&e.jsx(ce,{onClose:()=>j(!1)})]})}function T({s:t,pv:a}){const[c,i]=r.useState(!1),d=async h=>{i(!0),await q(h),i(!1)};return e.jsxs("div",{className:w("card flex items-center gap-3 p-3",t.done&&"opacity-70"),children:[e.jsx("button",{type:"button","aria-label":t.done?"رجّعها للقايمة":"اتجابت",title:t.done?"رجّعها للقايمة":"اتجابت",disabled:c,onClick:()=>d(()=>M(t.id,!t.done)),className:w("flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors",t.done?"border-green bg-green text-white":"border-line text-transparent hover:border-green hover:text-green"),children:t.done?e.jsx($,{className:"h-5 w-5"}):e.jsx($,{className:"h-5 w-5"})}),e.jsxs("div",{className:"min-w-0 flex-1",children:[e.jsx("div",{className:w("font-bold",t.done&&"line-through"),children:t.name}),e.jsxs("div",{className:"flex flex-wrap items-center gap-1.5 text-xs text-ink-3",children:[t.note&&e.jsx(u,{color:"orange",children:t.note}),a&&(a.allUncounted?e.jsx(u,{color:"gray",children:"لسه متجردش"}):e.jsxs(u,{color:a.stock<=0?"red":"green",children:["الموجود ",a.stock]})),!t.product_id&&e.jsx(u,{color:"purple",children:"مش في المنتجات"}),e.jsxs("span",{children:[t.user_name?`${t.user_name} • `:"",Y(t.done&&t.done_at?t.done_at:t.created_at)]})]})]}),t.done?e.jsx("button",{type:"button",className:"icon-btn","aria-label":"رجّعها",disabled:c,onClick:()=>d(()=>M(t.id,!1)),children:e.jsx(se,{className:"h-5 w-5"})}):null,e.jsx("button",{type:"button",className:"icon-btn text-ink-3 hover:text-red","aria-label":"حذف",disabled:c,onClick:async()=>{await B({title:"حذف من النواقص",message:`هيتشال "${t.name}" من القايمة`,ok:"حذف",danger:!0})&&await d(()=>te(t.id))},children:e.jsx(I,{className:"h-5 w-5"})})]})}function ce({onClose:t}){const[a,c]=r.useState("product"),[i,d]=r.useState(null),[h,f]=r.useState(""),[_,b]=r.useState(""),[k,v]=r.useState(!1),[j,s]=r.useState(!1),p=async()=>{s(!0);const l=await q(()=>ee(a==="product"?i?.p.id??null:null,a==="free"?h:null,_.trim()||null),"اتضاف للنواقص");s(!1),l&&t()};return e.jsxs(Z,{open:!0,onClose:t,size:"sm",title:"إضافة للنواقص",footer:e.jsx(g,{block:!0,loading:j,disabled:a==="product"?!i:!h.trim(),onClick:p,children:"إضافة"}),children:[e.jsxs("div",{className:"space-y-3",children:[e.jsx(D,{value:a,onChange:c,options:[{value:"product",label:"منتج عندنا"},{value:"free",label:"حاجة مش عندنا"}]}),a==="product"?e.jsx(N,{label:"المنتج",children:e.jsx("button",{type:"button",className:"input flex items-center text-right",onClick:()=>v(!0),children:i?e.jsx("span",{className:"truncate",children:i.p.name}):e.jsx("span",{className:"text-ink-3",children:"اختار المنتج"})})}):e.jsx(N,{label:"الاسم",children:e.jsx(F,{autoFocus:!0,value:h,onChange:l=>f(l.target.value),placeholder:"مثلاً: شاحن آيفون أصلي"})}),e.jsx(N,{label:"ملاحظة (اختياري)",children:e.jsx(F,{value:_,onChange:l=>b(l.target.value),placeholder:"مثلاً: الزبون طلب 3، أو هات اللون الأسود"})})]}),e.jsx(ae,{open:k,onClose:()=>v(!1),pickVariant:!1,onPick:l=>d(l)})]})}function de({owner:t}){const a=async()=>{try{await navigator.clipboard.writeText(le),y("تم نسخ الكود")}catch{y("مقدرناش ننسخ","error")}};return e.jsxs("div",{className:"card mb-4 border-orange/40 bg-orange-light p-4",children:[e.jsx("div",{className:"font-extrabold text-orange",children:"قايمة النواقص اللي بتتضاف بالإيد محتاجة تتفعّل مرة واحدة على السيرفر"}),t?e.jsxs(e.Fragment,{children:[e.jsxs("ol",{className:"mt-2 list-decimal space-y-1 pr-5 text-sm leading-6 text-ink-2",children:[e.jsx("li",{children:'دوس "نسخ كود التفعيل" تحت.'}),e.jsx("li",{children:"افتح supabase.com ← مشروع المحل ← SQL Editor ← New query."}),e.jsx("li",{children:"الزق الكود ودوس Run. بعدها ارجع هنا واعمل تحديث للصفحة."})]}),e.jsx(g,{variant:"soft",size:"sm",className:"mt-3",icon:e.jsx(oe,{className:"h-4 w-4"}),onClick:a,children:"نسخ كود التفعيل"})]}):e.jsx("div",{className:"mt-1 text-sm text-ink-2",children:"كلم المدير يفعّلها من صفحة النواقص. لحد ما يتفعّل، المنتجات اللي خلصت بتظهر هنا عادي."})]})}export{ge as default};
