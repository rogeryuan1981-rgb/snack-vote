"use client";

import { useEffect, useMemo, useState } from "react";
import { AppState, Product, buildDefaultState, getPhase, loadState, saveState } from "./lib/demo-data";

const icons: Record<string, string> = { 全部:"✦", 洋芋片:"◒", 餅乾:"▦", 巧克力:"◆", 糖果果凍:"●", 米果:"❋", 堅果果乾:"♧", 海苔肉乾:"▤", 飲料:"◫" };

export default function EmployeeHome() {
  const [state, setState] = useState<AppState>(() => buildDefaultState());
  const [ready, setReady] = useState(false);
  const [category, setCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const [confirmProduct, setConfirmProduct] = useState<Product | null>(null);
  const [discussion, setDiscussion] = useState<Product | null>(null);
  const [comment, setComment] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    setState(loadState()); setReady(true);
    const sync = () => setState(loadState());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const user = state.employees.find(e => e.id === state.currentUserId) ?? state.employees[0];
  const phase = getPhase(state.campaign);
  const myNominations = state.nominations.filter(n => n.userId === user.id);
  const myVotes = state.votes.filter(v => v.userId === user.id);
  const categories = ["全部", ...Array.from(new Set(state.products.map(p => p.category)))];
  const products = useMemo(() => {
    const term = query.trim().toLowerCase();
    const nominated = new Set(state.nominations.map(n => n.productId));
    return state.products.filter(p => p.active)
      .filter(p => phase === "nomination" || phase === "upcoming" || nominated.has(p.id))
      .filter(p => category === "全部" || p.category === category)
      .filter(p => !term || `${p.brand}${p.name}${p.category}`.toLowerCase().includes(term));
  }, [state, category, query, phase]);

  function commit(next: AppState, message?: string) {
    setState(next); saveState(next);
    if (message) { setToast(message); window.setTimeout(() => setToast(""), 2400); }
  }

  function requestNomination(product: Product) {
    if (myNominations.some(n => n.productId === product.id)) return setToast("這項商品已經是你的提名");
    if (myNominations.length >= state.campaign.nominationLimit) return setToast(`本期最多提名 ${state.campaign.nominationLimit} 項`);
    if (state.nominations.some(n => n.productId === product.id)) return setConfirmProduct(product);
    nominate(product);
  }

  function nominate(product: Product) {
    const createdAt = new Date().toISOString();
    commit({
      ...state,
      nominations: [...state.nominations, { productId: product.id, userId: user.id, createdAt }],
      votes: [...state.votes, { productId: product.id, userId: user.id, kind: "nomination", createdAt }],
    }, `已提名「${product.name}」，並固定計入 1 票`);
    setConfirmProduct(null);
  }

  function toggleVote(product: Product) {
    const nominationVote = myVotes.some(v => v.productId === product.id && v.kind === "nomination");
    if (nominationVote) return setToast("你的提名票固定保留，不能取消");
    const existing = myVotes.some(v => v.productId === product.id && v.kind === "regular");
    if (existing) return commit({ ...state, votes: state.votes.filter(v => !(v.userId === user.id && v.productId === product.id && v.kind === "regular")) }, "已取消這一票");
    if (myVotes.length >= state.campaign.voteLimit) return setToast(`已用完 ${state.campaign.voteLimit} 票，請先取消一張一般票`);
    const createdAt = new Date().toISOString();
    commit({ ...state, votes: [...state.votes, { productId: product.id, userId: user.id, kind: "regular", createdAt }] }, `已投給「${product.name}」`);
  }

  function addComment() {
    if (!discussion || !comment.trim()) return;
    commit({ ...state, comments: [...state.comments, { id: crypto.randomUUID(), productId: discussion.id, userId: user.id, text: comment.trim().slice(0, 180), createdAt: new Date().toISOString() }] }, "留言已發布");
    setComment("");
  }

  const shortDate=(value:string)=>new Intl.DateTimeFormat("zh-TW",{month:"numeric",day:"numeric"}).format(new Date(value+"T00:00:00"));
  const copy = phase === "upcoming"
    ? { label:"本期尚未開始", title:"本月零食活動即將開始", body:`提名將於 ${shortDate(state.campaign.startDate)} 開放，現在可以先瀏覽商品。` }
    : phase === "nomination"
      ? { label:"商品提名中", title:"把想吃的，放進本月候選單", body:`你可提名 ${state.campaign.nominationLimit} 項；每項提名都會固定使用 1 票。` }
      : phase === "voting"
        ? { label:"具名投票中", title:"本月零食，現在由大家決定", body:`你共有 ${state.campaign.voteLimit} 票，提名票固定保留，其餘票可在截止前更換。` }
        : phase === "results"
          ? { label:"結果揭曉中", title:"票數已鎖定，看看本月結果", body:"提名與投票均已截止；排名公開至安排採購日，所有票數都不能再修改。" }
          : { label:"安排採購中", title:"本月採購清單整理中", body:"排名與投票者均已封存，管理者正依預算及實際售價確認採購數量。" };
  const milestoneIndex={upcoming:-1,nomination:0,voting:1,results:2,purchase:3}[phase];
  const milestones=[
    {label:"開始",date:state.campaign.startDate},
    {label:"提名截止",date:state.campaign.nominationDeadline},
    {label:"投票截止",date:state.campaign.votingDeadline},
    {label:"安排採購",date:state.campaign.purchaseDate},
  ];
  const periods=[
    {label:"提名階段",from:state.campaign.startDate,to:state.campaign.nominationDeadline,key:"nomination"},
    {label:"投票階段",from:state.campaign.nominationDeadline,to:state.campaign.votingDeadline,key:"voting"},
    {label:"結果揭曉階段",from:state.campaign.votingDeadline,to:state.campaign.purchaseDate,key:"results"},
  ];

  if (!ready) return <main className="loading-screen">載入本月零食選單…</main>;
  return <main className="employee-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">S</span><div><strong>Snack Vote</strong><small>公司零食共選</small></div></div>
      <div className="profile"><span className="avatar">{user.name.slice(0,1)}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div>
    </header>
    <section className="hero">
      <div className="hero-main">
        <div className="eyebrow"><span className="live-dot"/>{copy.label}<span>·</span>{state.campaign.monthLabel}</div>
        <h1>{copy.title}</h1><p>{copy.body}</p>
        <div className="quota-row">
          <div className="quota-card"><span>我的提名</span><strong>{myNominations.length}<small>／{state.campaign.nominationLimit}</small></strong></div>
          <div className="quota-card"><span>本期票數</span><strong>{myVotes.length}<small>／{state.campaign.voteLimit}</small></strong></div>
          <div className="quota-card wide"><span>下一個時間點</span><strong className="date-value">{phase === "upcoming" ? `開始 · ${shortDate(state.campaign.startDate)}` : phase === "nomination" ? `提名截止 · ${shortDate(state.campaign.nominationDeadline)}` : phase === "voting" ? `投票截止 · ${shortDate(state.campaign.votingDeadline)}` : phase === "results" ? `安排採購 · ${shortDate(state.campaign.purchaseDate)}` : "已進入採購安排"}</strong></div>
        </div>
      </div>
      <div className="timeline-panel">
        <div className="milestone-row">{milestones.map((item,index)=><div className={"milestone "+(index<=milestoneIndex?"done":"")+(index===milestoneIndex?" current":"")} key={item.label}><span>{index+1}</span><strong>{item.label}</strong><small>{shortDate(item.date)}</small></div>)}</div>
        <div className="period-row">{periods.map(item=><div className={"period "+(phase===item.key?"active":"")} key={item.key}><strong>{item.label}</strong><small>{shortDate(item.from)}–{shortDate(item.to)}</small></div>)}</div>
      </div>
    </section>
    <section className="content-head"><div><p className="section-kicker">{phase === "nomination" || phase === "upcoming" ? "全聯常見零食參考庫" : "本月候選商品"}</p><h2>{phase === "nomination" ? "今天想提名哪一款？" : phase === "upcoming" ? "先看看本月可以選什麼" : "看看大家支持誰"}</h2></div><button className="history-button" onClick={() => setHistoryOpen(true)}>歷史月份 <span>→</span></button></section>
    <div className="filters"><label className="search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜尋商品、品牌或口味"/></label><div className="category-list">{categories.map(item => <button className={category === item ? "active" : ""} onClick={() => setCategory(item)} key={item}><span>{icons[item] ?? "·"}</span>{item}</button>)}</div></div>
    <section className="product-grid">{products.map(product => {
      const nominators = state.nominations.filter(n => n.productId === product.id).map(n => state.employees.find(e => e.id === n.userId)?.name).filter(Boolean) as string[];
      const voters = state.votes.filter(v => v.productId === product.id).map(v => state.employees.find(e => e.id === v.userId)?.name).filter(Boolean) as string[];
      const mine = myNominations.some(n => n.productId === product.id); const voted = myVotes.some(v => v.productId === product.id);
      const comments = state.comments.filter(c => c.productId === product.id);
      return <article className="product-card" key={product.id}>
        <div className={`product-visual tone-${product.tone}`}><span>{icons[product.category] ?? "✦"}</span><small>{product.category}</small>{product.popular && <b>人氣</b>}</div>
        <div className="product-body"><div className="brand-line"><span>{product.brand}</span><strong>參考 {`$${product.price}`}</strong></div><h3>{product.name}</h3><p>{product.size}</p>
          {nominators.length > 0 && <div className="nominator"><span className="mini-avatars">{nominators.slice(0,3).map(name => <i key={name}>{name.slice(0,1)}</i>)}</span><span>{nominators.join("、")} 提名</span></div>}
          {["voting","results","purchase"].includes(phase) && <button className="voter-line" onClick={() => setDiscussion(product)}><strong>{voters.length} 票</strong><span>{voters.length ? `由 ${voters.join("、")} 投票` : "還沒有人投票"}</span></button>}
          <div className="card-actions"><button className="comment-button" onClick={() => setDiscussion(product)}>◌ {comments.length}</button>{phase === "nomination" ? <button disabled={mine} className={`primary-action ${mine ? "selected" : ""}`} onClick={() => requestNomination(product)}>{mine ? "✓ 已提名" : "＋ 納入本期"}</button> : phase === "voting" ? <button className={`primary-action ${voted ? "selected" : ""}`} onClick={() => toggleVote(product)}>{voted ? (mine ? "▣ 提名票" : "✓ 已投票") : "投一票"}</button> : <span className="rank-label">{voters.length} 票</span>}</div>
        </div>
      </article>;
    })}</section>
    {confirmProduct && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setConfirmProduct(null)}><section className="modal-card"><div className="modal-icon">!</div><p className="section-kicker">重複提名提醒</p><h2>這款已經有人選了</h2><p>「{confirmProduct.name}」已由 {state.nominations.filter(n => n.productId === confirmProduct.id).map(n => state.employees.find(e => e.id === n.userId)?.name).join("、")} 提名。</p><div className="notice">仍要提名嗎？商品不會重複出現，但你會成為共同提名者，並固定使用本期 1 票。</div><div className="modal-actions"><button onClick={() => setConfirmProduct(null)}>先不要</button><button className="confirm" onClick={() => nominate(confirmProduct)}>確認提名並計票</button></div></section></div>}
    {discussion && <div className="drawer-backdrop" onMouseDown={e => e.target === e.currentTarget && setDiscussion(null)}><aside className="discussion"><button className="drawer-close" onClick={() => setDiscussion(null)}>×</button><p className="section-kicker">同仁討論</p><h2>{discussion.name}</h2><div className="comment-list">{state.comments.filter(c => c.productId === discussion.id).map(c => { const author = state.employees.find(e => e.id === c.userId); return <div className="comment" key={c.id}><span className="avatar small">{author?.name.slice(0,1)}</span><div><strong>{author?.name}</strong><small>{new Date(c.createdAt).toLocaleString("zh-TW",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</small><p>{c.text}</p></div></div>; })}{!state.comments.some(c => c.productId === discussion.id) && <div className="empty-state">還沒有留言，來當第一個拉票的人。</div>}</div><div className="comment-compose"><textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="分享你推薦它的理由…" maxLength={180}/><div><small>{comment.length}/180</small><button onClick={addComment}>發布留言</button></div></div></aside></div>}
    {historyOpen && <div className="drawer-backdrop" onMouseDown={e => e.target === e.currentTarget && setHistoryOpen(false)}><aside className="discussion history-drawer"><button className="drawer-close" onClick={() => setHistoryOpen(false)}>×</button><p className="section-kicker">歷史紀錄</p><h2>過去的零食清單</h2>{state.history.map(item => <article className="history-card" key={item.month}><div><span>{item.month}</span><strong>{`$${item.actualCost.toLocaleString()}`}</strong></div><h3>{item.winners.join("、")}</h3><p>{item.voterCount} 位同仁參與 · 共 {item.voteCount} 票</p></article>)}</aside></div>}
    {toast && <div className="toast">{toast}</div>}<footer>商品名稱與價格僅供採購參考，實際售價及庫存以門市為準。</footer>
  </main>;
}
