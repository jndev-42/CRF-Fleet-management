import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/lib/db";

declare module "next-auth" {
    interface Session {
        user: {
            roles: string[];
        } & DefaultSession["user"];
    }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
                params: {
                    prompt: "select_account",
                },
            },
        }),
    ],
    pages: {
        signIn: "/login",
        error: "/login",
    },
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user;
            const isApiAuthRoute = nextUrl.pathname.startsWith('/api/auth');
            const isLoginRoute = nextUrl.pathname === '/login';

            if (isApiAuthRoute) return true;

            if (isLoginRoute) {
                if (isLoggedIn) return Response.redirect(new URL('/', nextUrl));
                return true;
            }

            if (!isLoggedIn) {
                return false; // Redirects to sign-in page
            }

            return true;
        },
        async signIn({ user, profile }) {
            // Check both user object and profile object just in case
            const email = user?.email || profile?.email;
            if (!email) {
                console.error("Sign-in failed: No email provided by Google");
                return "/login?error=AccessDenied";
            }

            console.log("Login attempt with email:", email);

            // Strict restriction to @croix-rouge.fr emails (case insensitive)
            if (email.toLowerCase().endsWith("@croix-rouge.fr")) {
                try {
                    // Check if user exists
                    const resUser = await db.execute({
                        sql: 'SELECT id FROM "User" WHERE email = ?',
                        args: [email]
                    });

                    if (resUser.rows.length === 0) {
                        // User does not exist, create them
                        const guestRes = await db.execute(`SELECT id FROM "Role" WHERE name = 'GUEST'`);
                        if (guestRes.rows.length > 0) {
                            const userId = crypto.randomUUID();
                            const guestId = guestRes.rows[0].id;

                            await db.execute({
                                sql: 'INSERT INTO "User" (id, email, name) VALUES (?, ?, ?)',
                                args: [userId, email, user?.name || profile?.name || null]
                            });

                            await db.execute({
                                sql: 'INSERT INTO "UserRole" (userId, roleId) VALUES (?, ?)',
                                args: [userId, guestId]
                            });
                            console.log(`Auto-registered new user: ${email} with GUEST role`);
                        }
                    }
                } catch (e) {
                    console.error("Failed to auto-register user:", e);
                }
                return true;
            }

            console.log("Rejected email:", email);
            return "/login?error=AccessDenied"; // Explicitly redirect to our custom login page
        },
        async session({ session, token }) {
            // Ensure no unauthorized sessions linger somehow
            const email = session?.user?.email;
            if (!email || !email.toLowerCase().endsWith("@croix-rouge.fr")) {
                // Return invalid session
                return { ...session, error: "Unauthorized" } as any;
            }

            try {
                const res = await db.execute({
                    sql: `
                        SELECT r.name 
                        FROM "User" u
                        JOIN "UserRole" ur ON u.id = ur.userId
                        JOIN "Role" r ON ur.roleId = r.id
                        WHERE u.email = ?
                    `,
                    args: [email]
                });

                session.user.roles = res.rows.map(row => row.name as string);
                if (session.user.roles.length === 0) {
                    session.user.roles = ["GUEST"]; // Fallback if no roles found
                }
            } catch (e) {
                console.error("Failed to fetch user roles:", e);
                session.user.roles = ["GUEST"];
            }

            return session;
        }
    },
});
