import { createClient, type AuthChangeEvent, type Session, type User as SupabaseUser } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseEnabled = Boolean(supabaseUrl && supabaseAnonKey);
export const supabase = isSupabaseEnabled
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export type User = SupabaseUser & { uid: string; photoURL?: string };

function normalizeUser(user: SupabaseUser | null): User | null {
  if (!user) return null;
  return { ...user, uid: user.id, photoURL: user.user_metadata?.avatar_url };
}
export const auth = supabase;
export const db = supabase;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
}

export class GoogleAuthProvider {}

export function collection(_database: typeof supabase, ...segments: string[]) {
  return { userId: segments[1], table: segments[2] };
}

export function doc(_database: typeof supabase, ...segments: string[]) {
  return { userId: segments[1], table: segments[2], id: segments[3] };
}

function normalizeMachine(data: Record<string, unknown>, userId: string, id: string) {
  return {
    id,
    user_id: userId,
    type: data.type,
    position_x: data.positionX ?? data.position_x ?? 0,
    position_y: data.positionY ?? data.position_y ?? 0,
    position_z: data.positionZ ?? data.position_z ?? 0,
    sensors: data.sensors ?? [],
    images: data.images ?? [],
  };
}

export async function setDoc(
  reference: { userId?: string; table?: string; id?: string },
  data: Record<string, unknown>,
  options?: { merge?: boolean },
) {
  if (!supabase || !reference.userId || !reference.id) throw new Error('Supabase is not configured');
  const payload = reference.table === 'machines'
    ? normalizeMachine(data, reference.userId, reference.id)
    : data;
  const query = supabase.from(reference.table ?? 'machines');
  const result = options?.merge
    ? await query.update(data).eq('id', reference.id).eq('user_id', reference.userId)
    : await query.upsert(payload, { onConflict: 'id' });
  if (result.error) throw result.error;
}

export async function deleteDoc(reference: { userId?: string; table?: string; id?: string }) {
  if (!supabase || !reference.userId || !reference.id) throw new Error('Supabase is not configured');
  const { error } = await supabase.from(reference.table ?? 'machines').delete()
    .eq('id', reference.id).eq('user_id', reference.userId);
  if (error) throw error;
}

export function onSnapshot(
  reference: { userId?: string; table?: string },
  callback: (snapshot: { forEach: (fn: (item: { id: string; data: () => Record<string, unknown> }) => void) => void }) => void,
  onError?: (error: Error) => void,
) {
  if (!supabase || !reference.userId) return () => undefined;
  const table = reference.table ?? 'machines';
  const load = async () => {
    const { data, error } = await supabase.from(table).select('*').eq('user_id', reference.userId);
    if (error) return onError?.(error);
    callback({ forEach: (fn) => (data ?? []).forEach((row) => fn({ id: row.id, data: () => row })) });
  };
  void load();
  const channel = supabase.channel(`${table}:${reference.userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${reference.userId}` }, () => void load())
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

export async function signInWithPopup(_auth?: typeof supabase, _provider?: GoogleAuthProvider) {
  return signInWithGoogle();
}

export function onAuthStateChanged(
  callbackOrAuth: ((user: User | null) => void) | typeof supabase,
  maybeCallback?: (user: User | null) => void,
): () => void {
  const callback = maybeCallback ?? callbackOrAuth as (user: User | null) => void;
  if (!supabase) return () => undefined;
  supabase.auth.getSession().then(({ data }) => callback(normalizeUser(data.session?.user ?? null)));
  const { data } = supabase.auth.onAuthStateChange(
    (_event: AuthChangeEvent, session: Session | null) => callback(normalizeUser(session?.user ?? null)),
  );
  return () => data.subscription.unsubscribe();
}

export async function signInWithGoogle() {
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function getCurrentUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return normalizeUser(data.user);
}

export type MachineRecord = {
  id: string;
  user_id: string;
  type: string;
  position_x: number;
  position_y: number;
  position_z: number;
  sensors?: string[];
  images?: string[];
  [key: string]: unknown;
};

export function handleSupabaseError(error: unknown, operation: string, path: string) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(JSON.stringify({ error: message, operation, path }));
}
