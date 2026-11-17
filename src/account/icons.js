// Icon set for the account UI: Lucide (ISC licence) for interface icons, Simple Icons (CC0) for provider logos,
// and Google's official four-colour "G" (Google sign-in branding requires the coloured mark on a light button).
import { User, UserRound, Mail, Lock, KeyRound, Cloud, CloudOff, CloudUpload, CloudCheck, CloudAlert, ShieldCheck, Settings, LogOut, BadgeCheck,
  CircleAlert, CircleCheck, Eye, EyeOff, RefreshCw, Trash2, Link, TriangleAlert, Info, LoaderCircle, ArrowLeft, Pencil, History } from 'lucide';
import { siDiscord, siGithub, siApple } from 'simple-icons';
import { icon as gameIcon } from '../icons.js';

const LUCIDE = { user: User, userRound: UserRound, mail: Mail, lock: Lock, key: KeyRound, cloud: Cloud, cloudOff: CloudOff, cloudUp: CloudUpload, cloudOk: CloudCheck,
  cloudWarn: CloudAlert, shield: ShieldCheck, settings: Settings, logout: LogOut, verified: BadgeCheck, error: CircleAlert, ok: CircleCheck, eye: Eye, eyeOff: EyeOff,
  sync: RefreshCw, trash: Trash2, link: Link, warn: TriangleAlert, info: Info, spinner: LoaderCircle, back: ArrowLeft, edit: Pencil, history: History };

export function ui(name, size = 16, cls = '') {
  const node = LUCIDE[name];
  if (!node) return '';
  const inner = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
  return `<svg class="aico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
}

const GOOGLE_G = '<svg class="aico brand" width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
const SI = { discord: siDiscord, github: siGithub, apple: siApple };

// provider mark: Google keeps its colours; the others are single-colour Simple Icons paths (brand colours are set by CSS)
export function providerIcon(p, size = 18) {
  if (p === 'google') return GOOGLE_G;
  const si = SI[p];
  if (!si) return '';
  return `<svg class="aico brand" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="${si.path}"/></svg>`;
}

// avatar: one of the game's own pixel icons on a round Luna-blue badge
export function avatar(id, size = 48) {
  return `<span class="acc-av" style="width:${size}px;height:${size}px" aria-hidden="true">${gameIcon(id, Math.round(size * 0.58))}</span>`;
}
