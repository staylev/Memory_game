import { auth } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    await auth.api.signOut({
      headers: req.headers,
    });
    return Response.json({ success: true });
  } catch (error) {
    console.error("Sign-out error:", error);
    return Response.json({ error: "Ошибка выхода" }, { status: 500 });
  }
}