import { betterAuth } from 'better-auth/minimal';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { prisma } from './prisma';

const productionUrl =
  process.env.BETTER_AUTH_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'http://localhost:3000';

export const auth = betterAuth({
  baseURL: productionUrl,
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'LISTENER',
        input: false,
      },
    },
  },
});
