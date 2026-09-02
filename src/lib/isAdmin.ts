import type { UserData } from '../store/useUserStore';

/**
 * Whether to SHOW the admin tools. Cosmetic, and deliberately so.
 *
 * This decides what a menu renders, nothing else. The real enforcement is in
 * firestore.rules, which runs on Google's servers and cannot be edited by
 * anyone holding the page in a debugger. A student who forced this to true
 * would get the mining panel to appear and every write from it refused.
 *
 * WHY THE ROLE FIELD AND NOT THE ADMIN EMAIL. `isAdmin()` in firestore.rules
 * accepts either a known email address or `role == 'admin'` on the user
 * document. Mirroring the email arm here would compile a real person's address
 * into the client bundle that ships to every student — which is both a privacy
 * leak and a signpost saying exactly which account is worth phishing.
 *
 * The role field is the better signal anyway, because the rules already protect
 * it: `create` requires role to be 'client' or absent, and `update` requires
 * `request.resource.data.role == resource.data.role`, so a student cannot
 * promote themselves. It is still only used for what to draw.
 */

export function isAdminUser(userData: UserData | null | undefined): boolean {
  return userData?.role === 'admin';
}
