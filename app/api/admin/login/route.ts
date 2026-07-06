type AdminLoginRequest = {
  id?: unknown;
  password?: unknown;
};

const ADMIN_ID = process.env.MEAL_ADMIN_ID || process.env.ADMIN_ID || 'ys';
const ADMIN_PASSWORD = process.env.MEAL_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'ys1004!';

export async function POST(request: Request) {
  let body: AdminLoginRequest;

  try {
    body = await request.json() as AdminLoginRequest;
  } catch {
    return Response.json(
      { ok: false, message: '로그인 요청 형식이 올바르지 않습니다.' },
      { status: 400 }
    );
  }

  if (body.id === ADMIN_ID && body.password === ADMIN_PASSWORD) {
    return Response.json({ ok: true });
  }

  return Response.json(
    { ok: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' },
    { status: 401 }
  );
}
