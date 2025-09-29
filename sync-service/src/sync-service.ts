#!/usr/bin/env node
import 'dotenv/config'
import { ShopwareClient } from './shopware.js'
import { prisma } from './db.js'
import { program } from 'commander'
import chalk from 'chalk'
import { DateTime } from 'luxon'
import { geocodeAddress } from './geocoding.js'

// Configure logging
const log = {
  info: (message: string) => console.log(chalk.blue(`[${DateTime.now().toISO()}] [INFO] ${message}`)),
  success: (message: string) => console.log(chalk.green(`[${DateTime.now().toISO()}] [SUCCESS] ${message}`)),
  error: (message: string, error?: unknown) => {
    console.error(chalk.red(`[${DateTime.now().toISO()}] [ERROR] ${message}`))
    if (error) console.error(error)
  },
  verbose: (message: string) => {
    if (program.opts().verbose) {
      console.log(chalk.gray(`[${DateTime.now().toISO()}] [DEBUG] ${message}`))
    }
  }
}

function readCustomField(fields: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!fields) return undefined
  for (const key of keys) {
    const value = (fields as Record<string, unknown>)[key]
    if (value !== undefined && value !== null) {
      return value
    }
  }
  return undefined
}

function normaliseCoordinate(value: unknown): number | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  const parsed = parseFloat(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function formatPriceGroup(value: unknown): string | null {
  if (!value) return null
  const stringValue = String(value)
  const match = stringValue.match(/vk(?:[_\s-]*price)?[_\s-]*(\d+)/i)
  if (match && match[1]) {
    return `VK ${match[1]}`
  }
  return stringValue || null
}

/**
 * Get the timestamp of the last successful sync
 */
async function getLastSync() {
  try {
    const settings = await prisma.syncSettings.findUnique({
      where: { id: 1 }
    })
    return settings?.lastSync || null
  } catch (error) {
    log.error('Failed to get last sync time', error)
    return null
  }
}

/**
 * Update the last sync timestamp
 */
async function updateLastSync() {
  try {
    await prisma.syncSettings.upsert({
      where: { id: 1 },
      update: { lastSync: new Date() },
      create: { lastSync: new Date() }
    })
  } catch (error) {
    log.error('Failed to update last sync time', error)
    throw error
  }
}

/**
 * Synchronize customers from Shopware to the database
 */
async function syncCustomers(customers: any[]) {
  let successCount = 0
  let errorCount = 0

  for (const customer of customers) {
    try {
      const billing = customer.defaultBillingAddress
      let latitude = normaliseCoordinate(
        billing?.latitude ??
        readCustomField(billing?.customFields ?? null, ['latitude', 'lat', 'geoLatitude']) ??
        readCustomField(customer.customFields ?? null, ['latitude', 'lat', 'geoLatitude'])
      )

      let longitude = normaliseCoordinate(
        billing?.longitude ??
        readCustomField(billing?.customFields ?? null, ['longitude', 'lng', 'geoLongitude']) ??
        readCustomField(customer.customFields ?? null, ['longitude', 'lng', 'geoLongitude'])
      )

      if ((latitude == null || longitude == null) && (billing?.street || billing?.city)) {
        try {
          const geocoded = await geocodeAddress({
            street: billing?.street ?? undefined,
            city: billing?.city ?? undefined,
            zip: billing?.zipcode ?? undefined,
            country: billing?.country?.name ?? (readCustomField(customer.customFields ?? null, ['country', 'countryName']) as string | undefined)
          })
          if (geocoded) {
            latitude = geocoded.lat
            longitude = geocoded.lon
          }
        } catch (geocodeError) {
          console.warn('[sync-service] Failed to geocode address', {
            customerId: customer.id,
            email: customer.email,
            error: geocodeError instanceof Error ? geocodeError.message : geocodeError
          })
        }
      }

      const priceGroupValue = readCustomField(customer.customFields ?? null, [
        'vinaturel_tier_pricing_customer_default_price_group',
        'vinaturel_sales_representative_price_group',
        'standardPriceGroup'
      ])
      const priceGroup = formatPriceGroup(priceGroupValue)
      const totalRevenue = customer.orderTotalAmount !== undefined && customer.orderTotalAmount !== null
        ? Number(customer.orderTotalAmount)
        : null
      const orderCount = customer.orderCount !== undefined && customer.orderCount !== null
        ? Number(customer.orderCount)
        : null

      // Upsert customer
      await prisma.customer.upsert({
        where: { id: customer.id },
        update: {
          email: customer.email,
          company: customer.company || null,
          firstName: customer.firstName || null,
          lastName: customer.lastName || null,
          street: billing?.street || null,
          city: billing?.city || null,
          zip: billing?.zipcode || null,
          country: billing?.country?.name || null,
          phone: billing?.phoneNumber || null,
          latitude,
          longitude,
          customerNumber: customer.customerNumber || null,
          customerGroup: customer.group?.name || null,
          priceGroup,
          totalRevenue,
          orderCount,
          updatedAt: new Date()
        },
        create: {
          id: customer.id,
          email: customer.email,
          company: customer.company || null,
          firstName: customer.firstName || null,
          lastName: customer.lastName || null,
          street: billing?.street || null,
          city: billing?.city || null,
          zip: billing?.zipcode || null,
          country: billing?.country?.name || null,
          phone: billing?.phoneNumber || null,
          latitude,
          longitude,
          customerNumber: customer.customerNumber || null,
          customerGroup: customer.group?.name || null,
          priceGroup,
          totalRevenue,
          orderCount
        }
      })

      // Handle sales rep relationship if exists
      const assignmentId = readCustomField(customer.customFields ?? null, [
        'vinaturel_customer_sales_representative_assignment'
      ])
      const fallbackNumericId = readCustomField(customer.customFields ?? null, [
        'vinaturel_sales_representative_bios_mapping_vertreter_1'
      ])

      const salesRepId = assignmentId
        ? String(assignmentId)
        : fallbackNumericId
          ? `bios:${fallbackNumericId}`
          : customer.salesRepresentative?.id

      if (salesRepId) {
        const customEmail = readCustomField(customer.customFields ?? null, ['vinaturel_sales_representative_email'])
        const salesRepEmail = customer.salesRepresentative?.email?.toLowerCase()
          || (typeof customEmail === 'string' ? customEmail.toLowerCase() : customEmail ? String(customEmail).toLowerCase() : null)
          || `rep-${salesRepId}@example.com`
        // Upsert sales rep
        await prisma.salesRep.upsert({
          where: { id: salesRepId },
          update: {
            email: salesRepEmail,
            firstName: customer.salesRepresentative?.firstName || null,
            lastName: customer.salesRepresentative?.lastName || null,
            updatedAt: new Date()
          },
          create: {
            id: salesRepId,
            email: salesRepEmail,
            firstName: customer.salesRepresentative?.firstName || null,
            lastName: customer.salesRepresentative?.lastName || null
          }
        })

        // Create relationship
        await prisma.customerToSalesRep.upsert({
          where: {
            salesRepId_customerId: {
              salesRepId: salesRepId,
              customerId: customer.id
            }
          },
          update: {},
          create: {
            salesRepId: salesRepId,
            customerId: customer.id
          }
        })
      }

      successCount++
      log.verbose(`Processed customer ${customer.email}`)
    } catch (error) {
      errorCount++
      log.error(`Error processing customer ${customer.id}`, error)
    }
  }

  return { successCount, errorCount }
}

/**
 * Main sync function
 */
async function runSync(once: boolean = false) {
  const startTime = Date.now()
  
  try {
    const lastSync = await getLastSync()
    log.info(`Starting sync${lastSync ? ` (last sync: ${DateTime.fromJSDate(lastSync).toISO()})` : ' (first run)'}`)

    const shopware = new ShopwareClient(
      process.env.SHOPWARE_ADMIN_URL!,
      process.env.SHOPWARE_CLIENT_ID!,
      process.env.SHOPWARE_CLIENT_SECRET!,
      process.env.SHOPWARE_ADMIN_SCOPE ?? 'write'
    )

    const customers = await shopware.fetchCustomers(lastSync || undefined)
    log.info(`Fetched ${customers.length} customers from Shopware`)

    if (customers.length > 0) {
      const { successCount, errorCount } = await syncCustomers(customers)
      
      if (errorCount > 0) {
        log.error(`Completed with ${successCount} successes and ${errorCount} errors`)
      } else {
        log.success(`Successfully synced ${successCount} customers`)
      }
    } else {
      log.info('No new or updated customers to sync')
    }

    await updateLastSync()
  } catch (error) {
    log.error('Sync failed', error)
    process.exit(1)
  } finally {
    const duration = Math.round((Date.now() - startTime) / 1000)
    log.info(`Sync completed in ${duration} seconds`)
    
    try {
      await prisma.$disconnect()
    } catch (error) {
      log.error('Error disconnecting from database', error)
    }
  }

  // Schedule next run if not in --once mode
  if (!once) {
    const interval = parseInt(process.env.SYNC_INTERVAL_MINUTES || '30', 10) * 60 * 1000
    const nextRun = DateTime.now().plus({ milliseconds: interval }).toISO()
    log.info(`Next sync in ${Math.round(interval / 60000)} minutes (${nextRun})`)
    
    // Use setTimeout instead of setInterval to avoid overlapping runs
    setTimeout(() => runSync(once), interval)
  }
}

// Parse command line arguments
program
  .name('shopware-sync')
  .description('Sync customers from Shopware to PostgreSQL')
  .option('--once', 'Run sync once and exit', false)
  .option('--verbose', 'Enable verbose logging', false)
  .parse(process.argv)

// Validate environment variables
const requiredVars = ['SHOPWARE_ADMIN_URL', 'SHOPWARE_CLIENT_ID', 'SHOPWARE_CLIENT_SECRET', 'POSTGRES_URL']
const missingVars = requiredVars.filter(varName => !process.env[varName])

if (missingVars.length > 0) {
  log.error(`Missing required environment variables: ${missingVars.join(', ')}`)
  process.exit(1)
}
// Run the sync
runSync(program.opts().once).catch(error => {
  log.error('Unhandled error in sync service', error)
  process.exit(1)
})
