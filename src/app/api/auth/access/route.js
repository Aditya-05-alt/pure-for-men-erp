import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_ACCESS } from '@/lib/access/permissions';
import { loadNormalizedUserAccess } from '@/lib/access/userAccess';

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ access: DEFAULT_ACCESS, user: null });
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ access: DEFAULT_ACCESS, user: null });
  }

  try {
    const access = await loadNormalizedUserAccess(supabase, user.id);
    return NextResponse.json({
      access,
      user: { id: user.id, email: user.email || '' },
    });
  } catch (error) {
    if (
      /smart_user_roles|smart_user_reports|smart_user_dealers|schema cache|does not exist/i.test(
        error?.message || ''
      )
    ) {
      return NextResponse.json({
        access: DEFAULT_ACCESS,
        user: { id: user.id, email: user.email || '' },
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
