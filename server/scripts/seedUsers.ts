import 'dotenv/config';
import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: 'sync-service/.env', override: false });

type UpsertFn = typeof import('../userService').upsertUser;

async function getUpsert(): Promise<UpsertFn> {
  const module = await import('../userService');
  return module.upsertUser;
}

async function main() {
  const upsertUser = await getUpsert();

  const seedUsers = [
    {
      email: 'viberl@vinaturel.de',
      password: 'Vinaturel123',
      firstName: 'Verena',
      lastName: 'Iberl',
      salesRepEmail: 'viberl@vinaturel.de',
      salesRepId: '9a879fce4efc4003bfd1652318cba814',
      role: 'management'
    },
    {
      email: 'jsegura@vinaturel.de',
      password: 'Vinaturel123',
      firstName: 'José',
      lastName: 'Segura',
      salesRepEmail: 'jsegura@vinaturel.de',
      salesRepId: '018e091f4d1772908b838b34c45aed3d',
      role: 'sales_rep'
    },
    {
      email: 'jfranke@vinaturel.de',
      password: 'Vinaturel123',
      firstName: 'Jürgen',
      lastName: 'Franke',
      salesRepEmail: 'jfranke@vinaturel.de',
      salesRepId: '0190d9d3c13f7c77a0a35cdfba53ad90',
      role: 'management'
    },
    {
      email: 'cpesch@vinaturel.de',
      password: 'Vinaturel123',
      firstName: 'Christian',
      lastName: 'Pesch',
      salesRepEmail: 'cpesch@vinaturel.de',
      salesRepId: '0191b75c225178d3ba559b8875e94859',
      role: 'management'
    },
    {
      email: 'ogrossmann@vinaturel.de',
      password: 'Vinaturel123',
      firstName: 'Olaf',
      lastName: 'Großmann',
      salesRepEmail: 'ogrossmann@vinaturel.de',
      salesRepId: '7b9f2270ebb848c490ecc1ab4da298de',
      role: 'management'
    },
    {
      email: 'pkunert@vinaturel.de',
      password: 'Vinaturel123',
      firstName: 'Pascal',
      lastName: 'Kunert',
      salesRepEmail: 'pkunert@vinaturel.de',
      salesRepId: '0190d99d79f87ad4adb33e2c1e82b8d7',
      role: 'sales_rep'
    },
    {
      email: 'skatzki@vinaturel.de',
      password: 'Vinaturel123',
      firstName: 'Stefan',
      lastName: 'Katzki',
      salesRepEmail: 'skatzki@vinaturel.de',
      salesRepId: '0190d9a04c647cea8c91c98935410151',
      role: 'sales_rep'
    },
    {
      email: 'speter@vinaturel.de',
      password: 'Vinaturel123',
      firstName: 'Stefan',
      lastName: 'Peter',
      salesRepEmail: 'speter@vinaturel.de',
      salesRepId: '0190d9a47d6d7c23a224f1eaa57aace3',
      role: 'sales_rep'
    },
    {
      email: 'sriepenau@vinaturel.de',
      password: 'Vinaturel123',
      firstName: 'Sophie',
      lastName: 'Riepenau',
      salesRepEmail: 'sriepenau@vinaturel.de',
      salesRepId: '0190786cae3e7892b2897069b4b9d50c',
      role: 'sales_rep'
    },
    {
      email: 'kwiebersiek@vinaturel.de',
      password: 'Vinaturel123',
      firstName: 'Kerstin',
      lastName: 'Wiebersiek',
      salesRepEmail: 'kwiebersiek@vinaturel.de',
      salesRepId: '0190d99a22a5768396d278dbf615bf17',
      role: 'sales_rep'
    },
    {
      email: 'atenschert@vinaturel.de',
      password: 'Vinaturel123',
      firstName: 'Anne',
      lastName: 'Tenschert',
      salesRepEmail: 'atenschert@vinaturel.de',
      salesRepId: '018e0923c939737dbe75a773d688005e',
      role: 'sales_rep'
    },
    {
      email: 'iamante@vinaturel.de',
      password: 'Vinaturel123',
      firstName: 'Ignazio',
      lastName: 'Amante',
      salesRepEmail: 'iamante@vinaturel.de',
      salesRepId: '0190d9a28fb37d86a40e56e848d6f4fd',
      role: 'sales_rep'
    },
    {
      email: 'cmelsheimer@vinaturel.de',
      password: 'Vinaturel123',
      firstName: 'Christina',
      lastName: 'Melsheimer',
      salesRepEmail: 'cmelsheimer@vinaturel.de',
      salesRepId: '01907d1209a67893a35af779931c1dd2',
      role: 'sales_rep'
    },
    {
      email: 'hklotz@vinaturel.de',
      password: 'Vinaturel123',
      firstName: 'Holger',
      lastName: 'Klotz',
      salesRepEmail: 'hklotz@vinaturel.de',
      salesRepId: '018e0a340c1b714baff99e742acef701',
      role: 'sales_rep'
    }
  ];

  for (const user of seedUsers) {
    await upsertUser(user);
    console.log(`Seeded user ${user.email}`);
  }
}

main()
  .catch((error) => {
    console.error('Failed to seed CRM users', error);
    process.exit(1);
  })
  .finally(async () => {
    const { default: prisma } = await import('../prismaClient');
    await prisma.$disconnect();
  });
