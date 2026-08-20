import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

type Employee = { id:string; name:string; email:string; role:"employee"|"admin"; active:boolean };
type Campaign = { id:string; label:string; budget:number; nomination_limit:number; vote_limit:number; start_at:string; nomination_deadline:string; voting_deadline:string; purchase_at:string; status:string };
type Product = { id:string; brand:string; name:string; category:string; size:string; reference_price:number|null; approval_status:string; active:boolean };
type Nomination = { id:string; campaign_id:string; product_id:string; employee_id:string; nominator_name:string; created_at:string };
type Vote = { id:string; campaign_id:string; product_id:string; employee_id:string; voter_name:string; kind:"nomination"|"regular"; created_at:string };
type Comment = { id:string; campaign_id:string; product_id:string; employee_id:string; author_name:string; body:string; created_at:string };
type Phase = "upcoming"|"nomination"|"voting"|"results"|"purchase";

const icons:Record<string,string>={洋芋片:"◒",餅乾:"▦",巧克力:"◆",糖果果凍:"●",米果:"❋",堅果果乾:"♧",海苔肉乾:"▤",飲料:"◫"};
const tones=["tone-1","tone-2","tone-3","tone-4","tone-5","tone-6"];

function phaseOf(c:Campaign):Phase { const now=Date.now(); if(now<+new Date(c.start_at))return"upcoming";if(now<+new Date(c.nomination_deadline))return"nomination";if(now<+new Date(c.voting_deadline))return"voting";if(now<+new Date(c.purchase_at))return"results";return"purchase" }
function shortDate(value:string){return new Intl.DateTimeFormat("zh-TW",{month:"numeric",day:"numeric"}).format(new Date(value))}
function errorText(error:unknown){return error instanceof Error?error.message:"操作失敗，請稍後再試"}

export default function App(){
  const [session,setSession]=useState<Session|null>(null);
  const [employee,setEmployee]=useState<Employee|null>(null);
  const [loading,setLoading]=useState(true);
  const [denied,setDenied]=useState(false);
  const [route,setRoute]=useState(()=>location.hash||"#/");

  useEffect(()=>{
    if(!isSupabaseConfigured){setLoading(false);return}
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const {data}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));
    return()=>data.subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    const handleRouteChange=()=>setRoute(location.hash||"#/");
    window.addEventListener("hashchange",handleRouteChange);
    return()=>window.removeEventListener("hashchange",handleRouteChange);
  },[]);

  useEffect(()=>{
    if(!session){setEmployee(null);setDenied(false);setLoading(false);return}
    setLoading(true);
    supabase.from("employees").select("id,name,email,role,active").eq("user_id",session.user.id).maybeSingle()
      .then(({data,error})=>{setEmployee(data as Employee|null);setDenied(!data||Boolean(error));setLoading(false)});
  },[session]);

  if(!isSupabaseConfigured)return <SetupScreen/>;
  if(loading)return <main className="loading-screen">正在確認公司名單…</main>;
  if(!session)return <Login/>;
  if(denied||!employee)return <Unauthorized email={session.user.email??""}/>;
  const adminRoute=route.startsWith("#/admin");
  if(adminRoute&&employee.role!=="admin")return <Unauthorized email={employee.email} adminOnly/>;
  return adminRoute?<AdminApp employee={employee}/>:<EmployeeApp employee={employee}/>;
}

function SetupScreen(){return <main className="system-card"><p className="section-kicker">連線設定</p><h1>網站程式已準備連接 Supabase</h1><p>請建立 <code>.env.local</code>，填入 Project URL 與 Publishable Key，再重新啟動網站。</p><code>VITE_SUPABASE_URL=...<br/>VITE_SUPABASE_PUBLISHABLE_KEY=...</code></main>}

function Login(){
  const [email,setEmail]=useState("");const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [error,setError]=useState(false);
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);setMessage("");setError(false);const {error}=await supabase.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:location.href.split("#")[0]}});setBusy(false);if(error){setError(true);setMessage(error.message)}else setMessage("登入連結已寄出，請到信箱點擊後回到這個頁面。")}
  return <main className="auth-shell"><section className="auth-brand-panel"><div className="brand"><span className="brand-mark">S</span><div><strong>Snack Vote</strong><small>公司零食共選</small></div></div><div className="auth-copy"><p className="section-kicker">MONTHLY SNACK CLUB</p><h1>把想吃的，<br/>變成下個月的零食。</h1><p>同仁提名、公開具名投票，再依預算產生採購建議。規則透明，選擇也更有參與感。</p></div><div className="auth-flow"><span>01 提名</span><span>02 投票</span><span>03 結果揭曉</span><span>04 安排採購</span></div></section><section className="auth-panel"><form className="auth-card" onSubmit={submit}><p className="section-kicker">EMPLOYEE SIGN IN</p><h2>使用公司 Email 登入</h2><p>不需要設定密碼。系統只允許管理者名單中的 Email 查看與參與。</p><label>Email<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.com"/></label><button className="auth-submit" disabled={busy}>{busy?"寄送中…":"寄送登入連結"}</button>{message&&<p className={`auth-message ${error?"error":""}`}>{message}</p>}<small className="auth-note">若未收到信，請先檢查垃圾郵件，或向管理者確認名單中的 Email 是否正確。</small></form></section></main>
}

function Unauthorized({email,adminOnly=false}:{email:string;adminOnly?:boolean}){return <main className="system-card"><p className="section-kicker">ACCESS CONTROL</p><h1>{adminOnly?"這個頁面僅限管理者":"此 Email 不在啟用名單中"}</h1><p>{email}</p><p>{adminOnly?"你仍可回到員工頁面。":"請聯絡管理者確認名單，完成後重新登入。"}</p><button className="auth-submit" onClick={()=>adminOnly?location.hash="#/":supabase.auth.signOut()}>{adminOnly?"回員工頁面":"登出"}</button></main>}

function EmployeeApp({employee}:{employee:Employee}){
  const [campaign,setCampaign]=useState<Campaign|null>(null);const [products,setProducts]=useState<Product[]>([]);const [nominations,setNominations]=useState<Nomination[]>([]);const [votes,setVotes]=useState<Vote[]>([]);const [comments,setComments]=useState<Comment[]>([]);const [busy,setBusy]=useState(true);const [query,setQuery]=useState("");const [category,setCategory]=useState("全部");const [draftNominations,setDraftNominations]=useState<string[]>([]);const [toast,setToast]=useState("");
  const load=useCallback(async()=>{setBusy(true);const {data:c}=await supabase.from("campaigns").select("*").neq("status","draft").order("start_at",{ascending:false}).limit(1).maybeSingle();const current=c as Campaign|null;setCampaign(current);if(!current){setBusy(false);return}const [{data:p},{data:n},{data:v},{data:co}]=await Promise.all([supabase.from("products").select("*").eq("active",true).order("category"),supabase.from("nominations").select("*").eq("campaign_id",current.id),supabase.from("votes").select("*").eq("campaign_id",current.id),supabase.from("comments").select("*").eq("campaign_id",current.id).is("deleted_at",null).order("created_at")]);setProducts((p??[]) as Product[]);setNominations((n??[]) as Nomination[]);setVotes((v??[]) as Vote[]);setComments((co??[]) as Comment[]);setDraftNominations(((n??[]) as Nomination[]).filter(x=>x.employee_id===employee.id).map(x=>x.product_id));setBusy(false)},[employee.id]);
  useEffect(()=>{void load()},[load]);
  useEffect(()=>{if(!campaign)return;const channel=supabase.channel(`campaign-${campaign.id}`).on("postgres_changes",{event:"*",schema:"public"},()=>void load()).subscribe();return()=>{void supabase.removeChannel(channel)}},[campaign?.id,load]);
  function notify(message:string){setToast(message);setTimeout(()=>setToast(""),2600)}
  if(busy)return <main className="loading-screen">同步本月零食清單…</main>;
  if(!campaign)return <ShellHeader employee={employee}><section className="empty-campaign"><h2>本期活動尚未建立</h2><p>請等待管理者設定本月日期、預算與參與名單。</p></section></ShellHeader>;
  const phase=phaseOf(campaign);const myVotes=votes.filter(v=>v.employee_id===employee.id);const categories=["全部",...new Set(products.map(p=>p.category))];const nominatedProducts=new Set(nominations.map(n=>n.product_id));
  const shown=products.filter(p=>(phase==="nomination"||phase==="upcoming"||nominatedProducts.has(p.id))&&(category==="全部"||p.category===category)&&`${p.brand}${p.name}${p.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  async function toggleNomination(product:Product){if(phase!=="nomination")return;const selected=draftNominations.includes(product.id);if(!selected&&draftNominations.length>=campaign!.nomination_limit)return notify(`最多提名 ${campaign!.nomination_limit} 項`);if(!selected){const others=nominations.filter(n=>n.product_id===product.id&&n.employee_id!==employee.id);if(others.length&&!confirm(`這項已由 ${others.map(x=>x.nominator_name).join("、")} 提名。\n仍要共同提名並固定計入 1 票嗎？`))return}const next=selected?draftNominations.filter(id=>id!==product.id):[...draftNominations,product.id];setDraftNominations(next);const {error}=await supabase.rpc("set_nominations",{p_campaign_id:campaign!.id,p_product_ids:next});if(error){setDraftNominations(draftNominations);notify(error.message)}else{notify("提名已更新，固定票已同步");await load()}}
  async function toggleVote(product:Product){if(phase!=="voting")return;const fixed=myVotes.some(v=>v.product_id===product.id&&v.kind==="nomination");if(fixed)return notify("提名票已鎖定，投票階段不能取消");const regular=myVotes.filter(v=>v.kind==="regular").map(v=>v.product_id);const next=regular.includes(product.id)?regular.filter(id=>id!==product.id):[...regular,product.id];if(next.length+myVotes.filter(v=>v.kind==="nomination").length>campaign!.vote_limit)return notify(`本期最多 ${campaign!.vote_limit} 票`);const {error}=await supabase.rpc("set_regular_votes",{p_campaign_id:campaign!.id,p_product_ids:next});if(error)notify(error.message);else{notify("投票已更新");await load()}}
  const copy=phase==="nomination"?["商品提名中","把想吃的，放進本月候選單",`截止前可隨時更換；每項提名固定使用 1 票。`]:phase==="voting"?["具名投票中","本月零食，現在由大家決定",`你共有 ${campaign.vote_limit} 票；額外票可在截止前更換。`]:phase==="results"?["結果揭曉中","票數已鎖定，看看本月結果","排名與具名票數已公開。"]:phase==="upcoming"?["本期尚未開始","本月零食活動即將開始",`提名將於 ${shortDate(campaign.start_at)} 開放。`]:["安排採購中","本月採購清單整理中","管理者正依排名、預算與實際售價確認數量。"];
  return <ShellHeader employee={employee}><section className="hero"><div className="hero-main"><div className="eyebrow"><span className="live-dot"/>{copy[0]} · {campaign.label}</div><h1>{copy[1]}</h1><p>{copy[2]}</p><div className="quota-row"><div className="quota-card"><span>我的提名</span><strong>{draftNominations.length}<small>／{campaign.nomination_limit}</small></strong></div><div className="quota-card"><span>本期票數</span><strong>{myVotes.length}<small>／{campaign.vote_limit}</small></strong></div></div></div><Timeline campaign={campaign} phase={phase}/></section><section className="content-head"><div><p className="section-kicker">SNACK CATALOG</p><h2>{phase==="nomination"?"今天想提名哪一款？":"看看大家支持誰"}</h2></div></section><div className="filters"><label className="search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜尋商品、品牌或分類"/></label><div className="category-list">{categories.map(c=><button key={c} className={c===category?"active":""} onClick={()=>setCategory(c)}>{c}</button>)}</div></div><section className="product-grid">{shown.map((p,index)=>{const ns=nominations.filter(n=>n.product_id===p.id);const vs=votes.filter(v=>v.product_id===p.id);const selected=draftNominations.includes(p.id);const voted=myVotes.some(v=>v.product_id===p.id);return <article className="product-card" key={p.id}><div className={`product-visual ${tones[index%tones.length]}`}><span>{icons[p.category]??"✦"}</span><small>{p.category}</small></div><div className="product-body"><div className="brand-line"><span>{p.brand}</span><strong>{p.reference_price==null?"待確認":`參考 $${p.reference_price}`}</strong></div><h3>{p.name}</h3><p>{p.size}</p>{ns.length>0&&<div className="nominator"><span>{ns.map(n=>n.nominator_name).join("、")} 提名</span></div>}{["voting","results","purchase"].includes(phase)&&<div className="voter-line"><strong>{vs.length} 票</strong><span>{vs.map(v=>v.voter_name).join("、")||"尚無投票"}</span></div>}<div className="card-actions">{phase==="nomination"?<button className={`primary-action ${selected?"selected":""}`} onClick={()=>toggleNomination(p)}>{selected?"✓ 已提名（可取消）":"＋ 納入本期"}</button>:phase==="voting"?<button className={`primary-action ${voted?"selected":""}`} onClick={()=>toggleVote(p)}>{voted?(myVotes.some(v=>v.product_id===p.id&&v.kind==="nomination")?"▣ 提名票":"✓ 已投票"):"投一票"}</button>:<span className="rank-label">{vs.length} 票</span>}</div></div></article>})}{!shown.length&&<div className="empty-campaign">目前沒有符合條件的商品。</div>}</section>{toast&&<div className="toast">{toast}</div>}</ShellHeader>
}

function ShellHeader({employee,children}:{employee:Employee;children:React.ReactNode}){return <main className="employee-shell"><header className="topbar"><div className="brand"><span className="brand-mark">S</span><div><strong>Snack Vote</strong><small>公司零食共選</small></div></div><div className="top-actions">{employee.role==="admin"&&<a href="#/admin">管理後台</a>}<button onClick={()=>supabase.auth.signOut()}>登出</button><div className="profile"><span className="avatar">{employee.name.slice(0,1)}</span><div><strong>{employee.name}</strong><small>{employee.email}</small></div></div></div></header>{children}<footer>商品與價格僅供採購參考，實際售價及庫存以門市為準。</footer></main>}

function Timeline({campaign,phase}:{campaign:Campaign;phase:Phase}){const index={upcoming:-1,nomination:0,voting:1,results:2,purchase:3}[phase];const items=[["開始",campaign.start_at],["提名截止",campaign.nomination_deadline],["投票截止",campaign.voting_deadline],["安排採購",campaign.purchase_at]];return <div className="timeline-panel"><div className="milestone-row">{items.map((x,i)=><div key={x[0]} className={`milestone ${i<=index?"done":""} ${i===index?"current":""}`}><span>{i+1}</span><strong>{x[0]}</strong><small>{shortDate(x[1])}</small></div>)}</div><div className="period-row"><div className={`period ${phase==="nomination"?"active":""}`}><strong>提名階段</strong><small>{shortDate(campaign.start_at)}–{shortDate(campaign.nomination_deadline)}</small></div><div className={`period ${phase==="voting"?"active":""}`}><strong>投票階段</strong><small>{shortDate(campaign.nomination_deadline)}–{shortDate(campaign.voting_deadline)}</small></div><div className={`period ${phase==="results"?"active":""}`}><strong>結果揭曉階段</strong><small>{shortDate(campaign.voting_deadline)}–{shortDate(campaign.purchase_at)}</small></div></div></div>}

function AdminApp({employee}:{employee:Employee}){
  const [employees,setEmployees]=useState<Employee[]>([]);const [campaigns,setCampaigns]=useState<Campaign[]>([]);const [products,setProducts]=useState<Product[]>([]);const [name,setName]=useState("");const [email,setEmail]=useState("");const [message,setMessage]=useState("");
  const load=useCallback(async()=>{const [{data:e},{data:c},{data:p}]=await Promise.all([supabase.from("employees").select("id,name,email,role,active").order("name"),supabase.from("campaigns").select("*").order("start_at",{ascending:false}),supabase.from("products").select("*").order("category")]);setEmployees((e??[]) as Employee[]);setCampaigns((c??[]) as Campaign[]);setProducts((p??[]) as Product[])},[]);useEffect(()=>{void load()},[load]);
  async function addEmployee(e:FormEvent){e.preventDefault();const {error}=await supabase.from("employees").insert({name:name.trim(),email:email.trim().toLowerCase(),role:"employee"});setMessage(error?error.message:"員工已新增，可使用該 Email 登入");if(!error){setName("");setEmail("");await load()}}
  return <main className="admin-shell"><aside className="admin-nav"><div className="brand admin-brand"><span className="brand-mark">S</span><div><strong>Snack Vote</strong><small>管理後台</small></div></div><nav><a href="#/" style={{color:"inherit",textDecoration:"none"}}><button className="active"><span>←</span>回員工頁面</button></a></nav><div className="admin-user"><span className="avatar">{employee.name.slice(0,1)}</span><div><strong>{employee.name}</strong><small>系統管理者</small></div></div></aside><section className="admin-main"><header className="admin-top"><div><p className="section-kicker">ADMIN CONSOLE</p><h1>管理總覽</h1></div><button className="table-action" onClick={()=>supabase.auth.signOut()}>登出</button></header><div className="admin-content"><div className="stat-grid"><article><span>啟用員工</span><strong>{employees.filter(e=>e.active).length}</strong><small>人</small></article><article><span>活動紀錄</span><strong>{campaigns.length}</strong><small>期</small></article><article><span>商品資料庫</span><strong>{products.filter(p=>p.active).length}</strong><small>項</small></article><article><span>待審商品</span><strong>{products.filter(p=>p.approval_status==="pending").length}</strong><small>項</small></article></div><section className="admin-card"><div className="card-title"><div><p className="section-kicker">EMPLOYEE ROSTER</p><h2>員工名單</h2></div><span className="count-tag">{employees.length} 人</span></div><form className="add-employee" onSubmit={addEmployee}><input required placeholder="姓名" value={name} onChange={e=>setName(e.target.value)}/><input required type="email" placeholder="公司 Email" value={email} onChange={e=>setEmail(e.target.value)}/><button>＋ 新增員工</button></form>{message&&<p className="auth-message">{message}</p>}<div className="table-wrap"><table><thead><tr><th>姓名</th><th>Email</th><th>權限</th><th>狀態</th></tr></thead><tbody>{employees.map(e=><tr key={e.id}><td><strong>{e.name}</strong></td><td>{e.email}</td><td>{e.role==="admin"?"管理者":"員工"}</td><td><span className={e.active?"active-dot":"inactive-dot"}>{e.active?"啟用":"停用"}</span></td></tr>)}</tbody></table></div></section><section className="admin-card"><div className="card-title"><div><p className="section-kicker">NEXT SETUP</p><h2>資料庫已正式連線</h2></div></div><div className="rule-note"><strong>下一步</strong><span>接著加入「建立本期活動、商品庫匯入、待審商品、採購清單與歷史紀錄」的後台操作。</span></div></section></div></section></main>
}
