export type Phase = "upcoming" | "nomination" | "voting" | "results" | "purchase";
export type Employee = { id:string; name:string; email:string; active:boolean; role:"employee"|"admin" };
export type Product = { id:string; brand:string; name:string; size:string; category:string; price:number; tone:number; popular?:boolean; active:boolean };
export type Campaign = { monthLabel:string; budget:number; nominationLimit:number; voteLimit:number; startDate:string; nominationDeadline:string; votingDeadline:string; purchaseDate:string };
export type AppState = { campaign:Campaign; currentUserId:string; employees:Employee[]; products:Product[]; nominations:{productId:string;userId:string;createdAt:string}[]; votes:{productId:string;userId:string;kind:"nomination"|"regular";createdAt:string}[]; comments:{id:string;productId:string;userId:string;text:string;createdAt:string}[]; history:{month:string;winners:string[];actualCost:number;voterCount:number;voteCount:number}[] };
const KEY = "snack-voting-prototype-v1";
const iso = (date:Date) => date.toISOString().slice(0,10);
const offset = (days:number) => { const date=new Date(); date.setDate(date.getDate()+days); return iso(date); };
export const PRODUCTS:Product[] = [
  {id:"p1",brand:"義美",name:"小泡芙美味夾鏈包",size:"252g",category:"餅乾",price:136,tone:1,popular:true,active:true},
  {id:"p2",brand:"華元",name:"波的多洋芋片－玫瑰鹽",size:"73g",category:"洋芋片",price:36,tone:2,active:true},
  {id:"p3",brand:"可樂果",name:"Mini 豌豆酥原味分享包",size:"50g × 5",category:"米果",price:99,tone:3,popular:true,active:true},
  {id:"p4",brand:"盛香珍",name:"Dr.Q 零卡蒟蒻果凍",size:"420g",category:"糖果果凍",price:95,tone:4,active:true},
  {id:"p5",brand:"KitKat",name:"奇巧威化牛奶巧克力",size:"113g",category:"巧克力",price:125,tone:5,active:true},
  {id:"p6",brand:"M&M'S",name:"牛奶巧克力分享包",size:"175.5g",category:"巧克力",price:129,tone:6,popular:true,active:true},
  {id:"p7",brand:"義美",name:"海苔花生",size:"230g",category:"堅果果乾",price:125,tone:2,active:true},
  {id:"p8",brand:"洽洽",name:"茶衣瓜子",size:"140g",category:"堅果果乾",price:68,tone:3,active:true},
  {id:"p9",brand:"卡迪那",name:"德州薯條茄汁口味",size:"90g",category:"洋芋片",price:49,tone:1,active:true},
  {id:"p10",brand:"旺旺",name:"仙貝經濟包",size:"350g",category:"米果",price:119,tone:4,popular:true,active:true},
  {id:"p11",brand:"樂事",name:"美國經典原味洋芋片",size:"135g",category:"洋芋片",price:75,tone:5,active:true},
  {id:"p12",brand:"小林煎餅",name:"鮮奶薄餅",size:"200g",category:"餅乾",price:120,tone:6,active:true},
  {id:"p13",brand:"盛香珍",name:"白葡萄果凍",size:"300g",category:"糖果果凍",price:56,tone:1,active:true},
  {id:"p14",brand:"韓國嚴選",name:"傳統鹽烤海苔隨手包",size:"2g × 20",category:"海苔肉乾",price:149,tone:2,active:true},
  {id:"p15",brand:"新東陽",name:"蜜汁豬肉乾",size:"100g",category:"海苔肉乾",price:139,tone:3,active:true},
  {id:"p16",brand:"每朝健康",name:"無糖綠茶分享組",size:"650ml × 4",category:"飲料",price:116,tone:4,active:true},
  {id:"p17",brand:"泰山",name:"氣泡水檸檬風味",size:"500ml × 4",category:"飲料",price:100,tone:5,active:true},
  {id:"p18",brand:"紅布朗",name:"綜合堅果隨手包",size:"25g × 8",category:"堅果果乾",price:199,tone:6,active:true},
];
export function buildDefaultState():AppState {
  const now=new Date().toISOString();
  return { campaign:{monthLabel:`${new Date().getFullYear()} 年 ${new Date().getMonth()+1} 月`,budget:3000,nominationLimit:2,voteLimit:4,startDate:offset(-2),nominationDeadline:offset(5),votingDeadline:offset(12),purchaseDate:offset(16)}, currentUserId:"u1",
    employees:[{id:"u1",name:"林雅婷",email:"yating.lin@example.com",active:true,role:"employee"},{id:"u2",name:"王小明",email:"ming.wang@example.com",active:true,role:"employee"},{id:"u3",name:"陳冠宇",email:"kuanyu.chen@example.com",active:true,role:"employee"},{id:"u4",name:"張婉如",email:"wanru.chang@example.com",active:true,role:"admin"}],
    products:PRODUCTS, nominations:[{productId:"p1",userId:"u2",createdAt:now},{productId:"p4",userId:"u3",createdAt:now}], votes:[{productId:"p1",userId:"u2",kind:"nomination",createdAt:now},{productId:"p4",userId:"u3",kind:"nomination",createdAt:now}], comments:[{id:"c1",productId:"p1",userId:"u2",text:"辦公室下午茶永遠不會錯，巧克力口味拜託！",createdAt:now}], history:[{month:"2026 年 7 月",winners:["可樂果 Mini 豌豆酥","義美小泡芙","無糖綠茶"],actualCost:2860,voterCount:24,voteCount:81},{month:"2026 年 6 月",winners:["旺旺仙貝","M&M'S 分享包","鹽烤海苔"],actualCost:2945,voterCount:22,voteCount:74}] };
}
export function loadState():AppState {
  if(typeof window==="undefined") return buildDefaultState();
  try {
    const raw=localStorage.getItem(KEY); if(!raw) return buildDefaultState();
    const value=JSON.parse(raw) as AppState & {campaign:AppState["campaign"]&{nominationStart?:string;votingStart?:string;purchaseStart?:string}};
    const fallback=buildDefaultState().campaign;
    value.campaign={
      ...value.campaign,
      startDate:value.campaign.startDate??value.campaign.nominationStart??fallback.startDate,
      nominationDeadline:value.campaign.nominationDeadline??value.campaign.votingStart??fallback.nominationDeadline,
      votingDeadline:value.campaign.votingDeadline??value.campaign.purchaseStart??fallback.votingDeadline,
      purchaseDate:value.campaign.purchaseDate??fallback.purchaseDate,
    };
    return value;
  } catch { return buildDefaultState(); }
}
export function saveState(state:AppState){ localStorage.setItem(KEY,JSON.stringify(state)); }
export function getPhase(campaign:Campaign):Phase {
  const now=iso(new Date());
  if(now<campaign.startDate) return "upcoming";
  if(now<campaign.nominationDeadline) return "nomination";
  if(now<campaign.votingDeadline) return "voting";
  if(now<campaign.purchaseDate) return "results";
  return "purchase";
}
