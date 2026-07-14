import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function getClient(): SupabaseClient | null {
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getStoredPassword(sb: SupabaseClient) {
  const { data, error } = await sb.from("cm_settings").select("password").eq("id", 1).single();
  if (error) throw error;
  return (data as { password: string }).password;
}

export async function POST(req: Request) {
  const sb = getClient();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await req.json();

  try {
    if (body.action === "login") {
      const stored = await getStoredPassword(sb);
      if (body.password === stored) {
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ ok: false, error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    if (body.action === "change") {
      const stored = await getStoredPassword(sb);
      if (body.currentPassword !== stored) {
        return NextResponse.json({ ok: false, error: "현재 비밀번호가 올바르지 않습니다." }, { status: 401 });
      }
      if (!body.newPassword || typeof body.newPassword !== "string" || body.newPassword.length < 1) {
        return NextResponse.json({ ok: false, error: "새 비밀번호를 입력해주세요." }, { status: 400 });
      }
      const { error } = await sb
        .from("cm_settings")
        .update({ password: body.newPassword, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
