import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("training_auth");
  response.cookies.delete("training_lockout");
  return response;
}
