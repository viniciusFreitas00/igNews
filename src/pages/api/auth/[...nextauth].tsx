import { query as q } from 'faunadb';

import NextAuth from 'next-auth';
import GithubProvider from 'next-auth/providers/github';

import { fauna } from '../../../services/fauna';

export default NextAuth({
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
      authorization: {
        params: {
          scope: 'read:user',
        },
      },
    }),
  ],
  callbacks: {
    async session({ session }) {
      try {
        const userEmail = session?.user?.email;
        if (!userEmail) {
          return {
            ...session,
            activeSubscription: null,
          };
        }

        const userActiveSubscription = await fauna.query(
          q.Get(
            q.Intersection([
              q.Match(
                q.Index('subscription_by_user_ref'),
                q.Select(
                  'ref',
                  q.Get(
                    q.Match(
                      q.Index('user_by_email'),
                      q.Casefold(String(userEmail)),
                    ),
                  ),
                ),
              ),
              q.Match(q.Index('subscription_by_status'), 'active'),
            ]),
          ),
        );
        return {
          ...session,
          activeSubscription: userActiveSubscription,
        };
      } catch (e) {
        return {
          ...session,
          activeSubscription: null,
        };
      }
    },
    async signIn({ user }) {
      const email = user?.email;

      if (email) {
        return false;
      }

      try {
        await fauna.query(
          q.If(
            q.Not(
              q.Exists(
                q.Match(q.Index('user_by_email'), q.Casefold(String(email))),
              ),
            ),
            q.Create(q.Collection('users'), {
              data: { email },
            }),
            q.Get(q.Match(q.Index('user_by_email'), q.Casefold(String(email)))),
          ),
        );
        return true;
      } catch {
        return false;
      }
    },
  },
});
