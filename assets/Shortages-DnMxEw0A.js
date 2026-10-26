import{c as M,aM as L,aN as H,d as Q,aO as V,u as X,a9 as C,j as e,P as K,X as p,a3 as U,as as $,A as G,o as q,l as J,T as u,ai as O,ae as R,a8 as S,af as k,a4 as B,f as W,g as P,K as Y,a1 as Z,a5 as w,am as T,aP as ee,aQ as ne,aR as z,aS as te}from"./index-gpZH2awL.js";import{b as o}from"./vendor-T_9wQwNq.js";import{P as ae}from"./ProductPicker-D1Yt-7hI.js";import{P as se}from"./package-x-BFNak0Rn.js";import{R as oe}from"./rotate-ccw-D4ay3UoO.js";import"./supabase-DYxuN0_g.js";/**
 * @license lucide-react v1.59.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const D={name:"clipboard-copy",size:24,node:[["rect",{width:"8",height:"4",x:"8",y:"2",rx:"1",ry:"1",key:"tgr4d6"}],["path",{d:"M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",key:"4jdomd"}],["path",{d:"M16 4h2a2 2 0 0 1 2 2v4",key:"3hqy98"}],["path",{d:"M21 14H11",key:"1bme5i"}],["path",{d:"m15 10-4 4 4 4",key:"5dvupr"}]]};D.node;const re=M(D);/**
 * @license lucide-react v1.59.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const I={name:"share-2",size:24,node:[["circle",{cx:"18",cy:"5",r:"3",key:"gq8acd"}],["circle",{cx:"6",cy:"12",r:"3",key:"w7nqdw"}],["circle",{cx:"18",cy:"19",r:"3",key:"1xt0gg"}],["line",{x1:"8.59",x2:"15.42",y1:"13.51",y2:"17.49",key:"47mynk"}],["line",{x1:"15.41",x2:"8.59",y1:"6.51",y2:"10.49",key:"1n3mei"}]]};I.node;const ie=M(I),le=`-- ═══════════════════════════════════════════════════════════════════
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
`;function fe(){const{ready:t,missing:a,list:m}=L(),r=H(),h=Q(n=>n.byId),c=V(X(n=>n.profile)),[x,_]=o.useState(""),[b,v]=o.useState("open"),[N,j]=o.useState(!1),i=m.filter(n=>!n.done),g=m.filter(n=>n.done),y=new Set(i.filter(n=>n.product_id).map(n=>n.product_id)),d=r.filter(n=>!y.has(n.pv.p.id)),l=C(x),f=n=>!l||C(n).includes(l),A=()=>{const n=[...i.map(s=>`• ${s.name}${s.low?" — قرب يخلص":""}${s.note?` (${s.note})`:""}`),...d.map(s=>`• ${s.pv.p.name}${s.colors.length?` — ${s.colors.join("، ")}`:""}`)];return`النواقص (${n.length}):
${n.join(`
`)}`},E=async()=>{const n=A();try{navigator.share?await navigator.share({text:n}):(await navigator.clipboard.writeText(n),k("تم نسخ القايمة. الزقها في واتساب"))}catch{}};return e.jsxs("div",{className:"mx-auto max-w-3xl",children:[e.jsx(K,{title:"النواقص",sub:"الحاجات اللي خلصت ومحتاجة تتجاب",actions:e.jsxs(e.Fragment,{children:[e.jsx(p,{icon:e.jsx(U,{className:"h-5 w-5"}),onClick:()=>j(!0),disabled:!t,children:"إضافة"}),e.jsx(p,{variant:"outline",icon:e.jsx(ie,{className:"h-5 w-5"}),onClick:E,disabled:!i.length&&!d.length,children:"مشاركة القايمة"})]})}),a&&e.jsx(de,{owner:c}),e.jsxs("div",{className:"mb-3 flex flex-wrap gap-2",children:[e.jsx("div",{className:"w-full sm:w-72",children:e.jsx($,{value:b,onChange:v,options:[{value:"open",label:`محتاجة تتجاب (${i.length+d.length})`},{value:"done",label:`اتجابت (${g.length})`}]})}),e.jsx(G,{value:x,onChange:_,className:"min-w-[200px] flex-1"})]}),b==="open"?e.jsxs(e.Fragment,{children:[i.length+d.length===0&&e.jsx(q,{icon:e.jsx(J,{}),text:"مفيش نواقص. كل حاجة موجودة"}),i.filter(n=>f(n.name+" "+(n.note??""))).length>0&&e.jsxs("div",{className:"mb-4",children:[e.jsx("div",{className:"mb-2 font-extrabold",children:"اتضافت للنواقص"}),e.jsx("div",{className:"space-y-2",children:i.filter(n=>f(n.name+" "+(n.note??""))).map(n=>e.jsx(F,{s:n,pv:n.product_id?h.get(n.product_id):void 0},n.id))})]}),d.filter(n=>f(n.pv.p.name)).length>0&&e.jsxs("div",{children:[e.jsxs("div",{className:"mb-2 flex items-center gap-2 font-extrabold",children:["خلصت من المخزون ",e.jsx("span",{className:"text-xs font-bold text-ink-3",children:"(بتظهر لوحدها لما الكمية توصل صفر)"})]}),e.jsx("div",{className:"space-y-2",children:d.filter(n=>f(n.pv.p.name)).map(n=>e.jsxs("div",{className:"card flex items-center gap-3 p-3",children:[e.jsx("span",{className:"flex h-10 w-10 shrink-0 items-center justify-center rounded-btn bg-red-light text-red",children:e.jsx(se,{className:"h-5 w-5"})}),e.jsxs("div",{className:"min-w-0 flex-1",children:[e.jsx("div",{className:"truncate font-bold",children:n.pv.p.name}),e.jsxs("div",{className:"flex flex-wrap gap-1 text-xs",children:[n.colors.length?n.colors.map(s=>e.jsxs(u,{color:"red",children:[s," خلص"]},s)):e.jsx(u,{color:"red",children:"الكمية 0"}),n.pv.hasVariants&&!n.pv.outOfStock&&e.jsxs(u,{color:"gray",children:["باقي ألوان تانية ",n.pv.stock]})]})]})]},n.pv.p.id))})]})]}):e.jsx(e.Fragment,{children:g.length===0?e.jsx(q,{icon:e.jsx(O,{}),text:"مفيش حاجة اتعلّمت إنها اتجابت"}):e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"mb-2 flex justify-end",children:e.jsx(p,{variant:"ghost",size:"sm",icon:e.jsx(B,{className:"h-4 w-4"}),onClick:async()=>{if(!await R({title:"مسح اللي اتجاب",message:`هيتمسح ${g.length} من القايمة`,ok:"مسح",danger:!0}))return;let n=0;await S(async()=>n=await ne())&&k(`تم مسح ${n}`)},children:"مسح اللي اتجاب"})}),e.jsx("div",{className:"space-y-2",children:g.filter(n=>f(n.name)).map(n=>e.jsx(F,{s:n,pv:n.product_id?h.get(n.product_id):void 0},n.id))})]})}),N&&e.jsx(ce,{onClose:()=>j(!1)})]})}function F({s:t,pv:a}){const m=W(),[r,h]=o.useState(!1),c=async x=>{h(!0),await S(x),h(!1)};return e.jsxs("div",{className:P("card flex items-center gap-2 p-3",t.done&&"opacity-70"),children:[e.jsxs("div",{className:"min-w-0 flex-1",children:[e.jsx("div",{className:P("font-bold",t.done&&"line-through"),children:t.name}),e.jsxs("div",{className:"flex flex-wrap items-center gap-1.5 text-xs text-ink-3",children:[!t.done&&e.jsx(u,{color:t.low?"orange":"red",children:t.low?"قرب يخلص":"خلص"}),t.note&&e.jsx(u,{color:"gray",children:t.note}),a&&m&&(a.allUncounted?e.jsx(u,{color:"gray",children:"لسه متجردش"}):e.jsxs(u,{color:a.stock<=0?"red":"green",children:["الموجود ",a.stock]})),!t.product_id&&e.jsx(u,{color:"purple",children:"مش في المنتجات"}),e.jsxs("span",{children:[t.user_name?`${t.user_name} • `:"",Y(t.done&&t.done_at?t.done_at:t.created_at)]})]})]}),t.done?e.jsx(p,{size:"sm",variant:"outline",className:"h-10 shrink-0 px-3",icon:e.jsx(oe,{className:"h-4 w-4"}),disabled:r,onClick:()=>c(()=>z(t.id,!1)),children:"رجّعها"}):e.jsx(p,{size:"sm",variant:"green",className:"h-10 shrink-0 px-3",icon:e.jsx(O,{className:"h-4 w-4"}),disabled:r,onClick:()=>c(()=>z(t.id,!0)),children:"اتجاب"}),e.jsx("button",{type:"button",className:"icon-btn text-ink-3 hover:text-red","aria-label":"حذف",disabled:r,onClick:async()=>{await R({title:"حذف من النواقص",message:`هيتشال "${t.name}" من القايمة`,ok:"حذف",danger:!0})&&await c(()=>te(t.id))},children:e.jsx(B,{className:"h-5 w-5"})})]})}function ce({onClose:t}){const[a,m]=o.useState("product"),[r,h]=o.useState(null),[c,x]=o.useState(""),[_,b]=o.useState(""),[v,N]=o.useState("out"),[j,i]=o.useState(!1),[g,y]=o.useState(!1),d=async()=>{y(!0);const l=await S(()=>ee(a==="product"?r?.p.id??null:null,a==="free"?c:null,_.trim()||null,v==="low"),"اتضاف للنواقص");y(!1),l&&t()};return e.jsxs(Z,{open:!0,onClose:t,size:"sm",title:"إضافة للنواقص",footer:e.jsx(p,{block:!0,loading:g,disabled:a==="product"?!r:!c.trim(),onClick:d,children:"إضافة"}),children:[e.jsxs("div",{className:"space-y-3",children:[e.jsx($,{value:a,onChange:m,options:[{value:"product",label:"منتج عندنا"},{value:"free",label:"حاجة مش عندنا"}]}),a==="product"?e.jsx(w,{label:"المنتج",children:e.jsx("button",{type:"button",className:"input flex items-center text-right",onClick:()=>i(!0),children:r?e.jsx("span",{className:"truncate",children:r.p.name}):e.jsx("span",{className:"text-ink-3",children:"اختار المنتج"})})}):e.jsx(w,{label:"الاسم",children:e.jsx(T,{autoFocus:!0,value:c,onChange:l=>x(l.target.value),placeholder:"مثلاً: شاحن آيفون أصلي"})}),e.jsx(w,{label:"الحالة",children:e.jsx($,{value:v,onChange:N,options:[{value:"out",label:"خلص"},{value:"low",label:"قرب يخلص"}]})}),e.jsx(w,{label:"ملاحظة (اختياري)",children:e.jsx(T,{value:_,onChange:l=>b(l.target.value),placeholder:"مثلاً: الزبون طلب 3، أو هات اللون الأسود"})})]}),e.jsx(ae,{open:j,onClose:()=>i(!1),pickVariant:!1,onPick:l=>h(l)})]})}function de({owner:t}){const a=async()=>{try{await navigator.clipboard.writeText(le),k("تم نسخ الكود")}catch{k("مقدرناش ننسخ","error")}};return e.jsxs("div",{className:"card mb-4 border-orange/40 bg-orange-light p-4",children:[e.jsx("div",{className:"font-extrabold text-orange",children:"قايمة النواقص اللي بتتضاف بالإيد محتاجة تتفعّل مرة واحدة على السيرفر"}),t?e.jsxs(e.Fragment,{children:[e.jsxs("ol",{className:"mt-2 list-decimal space-y-1 pr-5 text-sm leading-6 text-ink-2",children:[e.jsx("li",{children:'دوس "نسخ كود التفعيل" تحت.'}),e.jsx("li",{children:"افتح supabase.com ← مشروع المحل ← SQL Editor ← New query."}),e.jsx("li",{children:"الزق الكود ودوس Run. بعدها ارجع هنا واعمل تحديث للصفحة."})]}),e.jsx(p,{variant:"soft",size:"sm",className:"mt-3",icon:e.jsx(re,{className:"h-4 w-4"}),onClick:a,children:"نسخ كود التفعيل"})]}):e.jsx("div",{className:"mt-1 text-sm text-ink-2",children:"كلم المدير يفعّلها من صفحة النواقص. لحد ما يتفعّل، المنتجات اللي خلصت بتظهر هنا عادي."})]})}export{fe as default};
