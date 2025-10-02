import argon2 from 'argon2';
import prisma from './prismaClient';

export interface CreateUserInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  salesRepEmail?: string;
  salesRepId?: string;
  role?: string;
  profileImageUrl?: string | null;
}

export async function findUserByEmail(email: string) {
  return prisma.crmUser.findUnique({ where: { email: email.toLowerCase() } });
}

export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

export async function createUser(input: CreateUserInput) {
  const passwordHash = await argon2.hash(input.password);
  return prisma.crmUser.create({
    data: {
      email: input.email.toLowerCase(),
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      salesRepEmail: input.salesRepEmail?.toLowerCase(),
      salesRepId: input.salesRepId,
      role: input.role ?? 'sales_rep',
      profileImageUrl: input.profileImageUrl ?? null,
    }
  });
}

export async function upsertUser(input: CreateUserInput) {
  const passwordHash = await argon2.hash(input.password);
  return prisma.crmUser.upsert({
    where: { email: input.email.toLowerCase() },
    update: {
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      salesRepEmail: input.salesRepEmail?.toLowerCase(),
      salesRepId: input.salesRepId,
      role: input.role ?? 'sales_rep',
      profileImageUrl: input.profileImageUrl ?? null,
    },
    create: {
      email: input.email.toLowerCase(),
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      salesRepEmail: input.salesRepEmail?.toLowerCase(),
      salesRepId: input.salesRepId,
      role: input.role ?? 'sales_rep',
      profileImageUrl: input.profileImageUrl ?? null,
    }
  });
}

export async function updateUserPassword(userId: string, newPassword: string) {
  const passwordHash = await argon2.hash(newPassword);
  return prisma.crmUser.update({
    where: { id: userId },
    data: { passwordHash }
  });
}

export async function updateUserProfileImage(userId: string, profileImageUrl: string | null) {
  return prisma.crmUser.update({
    where: { id: userId },
    data: { profileImageUrl }
  });
}
