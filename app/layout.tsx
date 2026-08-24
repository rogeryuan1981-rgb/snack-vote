import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./timeline.css";

export async function generateMetadata():Promise<Metadata>{
  const requestHeaders=await headers();
  const host=requestHeaders.get("x-forwarded-host")??requestHeaders.get("host")??"localhost:3000";
  const protocol=requestHeaders.get("x-forwarded-proto")??(host.startsWith("localhost")?"http":"https");
  const image=new URL("/og.png",protocol+"://"+host).toString();
  return {
    title:"Snack Vote｜公司零食共選",
    description:"每月由同仁提名、拉票與具名投票，再依預算產生採購清單。",
    openGraph:{title:"Snack Vote｜公司零食共選",description:"每月由同仁提名、拉票與具名投票，再依預算產生採購清單。",images:[image]},
    twitter:{card:"summary_large_image",title:"Snack Vote｜公司零食共選",description:"每月由同仁提名、拉票與具名投票，再依預算產生採購清單。",images:[image]},
  };
}
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="zh-TW"><body>{children}</body></html>}
