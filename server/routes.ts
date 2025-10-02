import "./env";
import { Express, Request, Response, NextFunction, json } from "express";
import { createServer } from "http";
import { Server as SocketIOServer, Socket, DefaultEventsMap } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import {
  addYears,
  eachMonthOfInterval,
  endOfDay,
  endOfMonth,
  endOfQuarter,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  subMilliseconds,
  subMonths,
  subYears,
} from "date-fns";
import { de } from "date-fns/locale";
import prisma from "./prismaClient";
import { adminSearch, getAdminAxios } from "./shopwareAdmin";
import {
  Prisma,
  type CustomerInteraction as PrismaCustomerInteraction,
  type Task as PrismaTask,
  type TaskDependency as PrismaTaskDependency,
} from "@prisma/client";
import { z } from "zod";
import { findUserByEmail, verifyPassword, updateUserPassword, updateUserProfileImage } from "./userService";
import type { MapCustomer } from "@shared/types/map-customer";
import type {
  CreateCustomerInteractionRequest,
  CustomerInteractionsResponse,
  CustomerInteraction as CustomerInteractionDto,
  FollowUpPriority,
  FollowUpReminder,
} from "@shared/types/interaction";
import type {
  Task as TaskDto,
  TaskListResponse,
  CreateTaskRequest,
  UpdateTaskRequest,
  TaskDependencyEdge,
  TaskSummary,
  TaskResponse,
} from "@shared/types/task";
import type { CustomerOrderSummary, CustomerOrderItem } from "@shared/types/order";
import type { DashboardOrderSummary, DashboardData, DashboardStats } from "@shared/types/dashboard";
import type {
  AnalyticsSummaryResponse,
  AnalyticsPeriodType,
  AnalyticsCustomerGroup,
  AnalyticsTrendPoint,
} from "@shared/types/analytics";
import type { LintherListeResponse, LintherListeRow } from "@shared/types/linther-liste";
import { getLintherListe, addLintherListeRow, GraphApiError } from "./services/lintherListeService";
import type {
  CatalogListResponse,
  CatalogSummaryItem,
  CatalogDetailResponse,
  CatalogDetailItem,
  CatalogPriceTier,
  CatalogTopCustomer,
  CatalogStockHistoryPoint,
  CatalogMonthlySalesPoint,
} from "@shared/types/catalog";
import type { CustomerWishlistResponse, CustomerWishlistEntry } from "@shared/types/customer-wishlist";
import { auth, AuthRequest, generateToken } from "./auth";
import jwt from 'jsonwebtoken';
import { geocodeAddress } from "./geocoding";
import {
  buildMicrosoftAuthUrl,
  exchangeCodeForToken,
  fetchUpcomingEvents,
  getValidAccessToken,
  isMicrosoftGraphConfigured,
  storeTokenSet,
  disconnectMicrosoftAccount
} from "./microsoftGraph";
import {
  SocketAuthData,
  SocketUserData,
  SocketData,
  ClientToServerEvents,
  ServerToClientEvents,
  CustomSocket,
  CustomSocketIOServer
} from "./types/socket.types";

declare module 'express-session' {
  interface SessionData {
    microsoftOAuth?: {
      state: string;
      userId: string;
      createdAt: number;
    };
  }
}

// Extend the default Socket.IO types
declare module 'socket.io' {
  // Add user property to the Socket interface
  interface Socket {
    user?: SocketUserData;
  }
  
  // Add index signature to avoid type errors
  interface Server {
    [key: string]: any;
  }
}

// Load environment variables
dotenv.config();

// Ensure required environment variables are set
if (!process.env.JWT_SECRET) {
  console.warn('WARNUNG: JWT_SECRET ist nicht gesetzt. Verwende Standardwert.');
}

if (!process.env.SHOPWARE_URL) {
  throw new Error('SHOPWARE_URL muss in der .env Datei gesetzt sein');
}

if (!process.env.SHOPWARE_ACCESS_KEY) {
  throw new Error('SHOPWARE_ACCESS_KEY muss in der .env Datei gesetzt sein');
}

if (!process.env.CLIENT_URL) {
  console.warn('WARNUNG: CLIENT_URL ist nicht gesetzt. Verwende Standardwert.');
}

const SHOPWARE_BASE_URL = process.env.SHOPWARE_URL?.replace(/\/$/, '') ?? '';

const customerRelationInclude = {
  salesReps: {
    include: {
      salesRep: true,
    },
  },
  interactions: {
    orderBy: { occurredAt: 'desc' as const },
    take: 1,
    select: {
      occurredAt: true,
    },
  },
} as const;

const taskFetchArgs = {
  include: {
    customer: {
      select: {
        id: true,
        company: true,
        firstName: true,
        lastName: true,
        customerNumber: true,
      },
    },
    assignedTo: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    },
    createdBy: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    },
    watchers: {
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    },
    attachments: {
      include: {
        uploader: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    },
    dependenciesFrom: {
      include: {
        successor: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    },
    dependenciesTo: {
      include: {
        predecessor: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    },
  },
} as const;

const isManagementRole = (role?: string | null) =>
  role === 'management' || role === 'admin' || role === 'executive';

const hasAllCustomerAccess = (role?: string | null) => {
  if (!role) return false;
  const normalized = role.toLowerCase();
  return normalized === 'management' || normalized === 'admin' || normalized === 'executive' || normalized === 'innendienst';
};

const formatUserName = (user?: { firstName: string | null; lastName: string | null; email: string }) => {
  if (!user) return null;
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return name || user.email;
};

const TASK_STATUSES = ['open', 'in_progress', 'waiting', 'completed'] as const;
const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
const TASK_CATEGORIES = ['follow_up', 'tasting', 'campaign', 'other'] as const;

const isTaskStatus = (value: string): value is (typeof TASK_STATUSES)[number] =>
  TASK_STATUSES.includes(value as (typeof TASK_STATUSES)[number]);

const isTaskPriority = (value: string): value is (typeof TASK_PRIORITIES)[number] =>
  TASK_PRIORITIES.includes(value as (typeof TASK_PRIORITIES)[number]);

const isTaskCategory = (value: string): value is (typeof TASK_CATEGORIES)[number] =>
  TASK_CATEGORIES.includes(value as (typeof TASK_CATEGORIES)[number]);

const taskStatusSchema = z.enum(TASK_STATUSES);
const taskPrioritySchema = z.enum(TASK_PRIORITIES);
const taskCategorySchema = z.enum(TASK_CATEGORIES);

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().max(2000).optional().nullable(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  category: taskCategorySchema.optional(),
  customerId: z.string().min(1).optional().nullable(),
  assignedToId: z.string().min(1).optional().nullable(),
  startAt: z.union([z.string(), z.date()]).optional().nullable(),
  dueAt: z.union([z.string(), z.date()]).optional().nullable(),
  slaMinutes: z.number().int().nonnegative().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
  watcherIds: z.array(z.string().min(1)).optional(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().max(2000).optional().nullable(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  category: taskCategorySchema.optional(),
  customerId: z.string().min(1).optional().nullable(),
  assignedToId: z.string().min(1).optional().nullable(),
  startAt: z.union([z.string(), z.date(), z.null()]).optional(),
  dueAt: z.union([z.string(), z.date(), z.null()]).optional(),
  completedAt: z.union([z.string(), z.date(), z.null()]).optional(),
  startedAt: z.union([z.string(), z.date(), z.null()]).optional(),
  slaMinutes: z.number().int().nonnegative().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
  dependencies: z
    .object({
      predecessorIds: z.array(z.string().min(1)).optional(),
      successorIds: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  watchers: z
    .object({
      add: z.array(z.string().min(1)).optional(),
      remove: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  attachments: z
    .object({
      add: z
        .array(
          z.object({
            fileName: z.string().min(1),
            fileUrl: z.string().url(),
          })
        )
        .optional(),
      removeIds: z.array(z.string().min(1)).optional(),
    })
    .optional(),
});

const parseDateInput = (value: unknown): Date | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const pushAndClause = (target: Prisma.TaskWhereInput, clause: Prisma.TaskWhereInput) => {
  if (!target.AND) {
    target.AND = [clause];
  } else if (Array.isArray(target.AND)) {
    target.AND.push(clause);
  } else {
    target.AND = [target.AND, clause];
  }
};

const pushOrClause = (target: Prisma.TaskWhereInput, clause: Prisma.TaskWhereInput) => {
  if (!target.OR) {
    target.OR = [clause];
  } else if (Array.isArray(target.OR)) {
    target.OR.push(clause);
  } else {
    target.OR = [target.OR, clause];
  }
};

const toJsonInput = (value: Record<string, unknown> | null | undefined) =>
  value === undefined
    ? undefined
    : value === null
      ? Prisma.JsonNull
      : (value as Prisma.InputJsonValue);

type CustomerWithRelations = Prisma.CustomerGetPayload<{
  include: typeof customerRelationInclude;
}>;

const SHOPWARE_ASSIGNMENT_FIELD = 'customFields.vinaturel_customer_sales_representative_assignment';

type CrmUserContext = {
  id: string;
  email?: string | null;
  salesRepEmail?: string | null;
  salesRepId?: string | null;
  role?: string | null;
};

function normaliseCoordinateValue(value: number | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toString() : null;
  }
  const parsed = parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed.toString() : null;
}

function isCustomerAssignedToUser(
  customer: CustomerWithRelations,
  crmUser: { salesRepId?: string | null; salesRepEmail?: string | null; role?: string | null }
): boolean {
  if (hasAllCustomerAccess(crmUser.role)) {
    return true;
  }
  const normalizedEmail = crmUser.salesRepEmail?.toLowerCase() ?? null;

  return customer.salesReps.some((assignment) => {
    const matchesId = crmUser.salesRepId && assignment.salesRepId === crmUser.salesRepId;
    const matchesEmail = normalizedEmail && assignment.salesRep?.email?.toLowerCase() === normalizedEmail;
    return Boolean(matchesId || matchesEmail);
  });
}

function mapCustomerToResponse(
  customer: CustomerWithRelations,
  crmUser: { salesRepId?: string | null; salesRepEmail?: string | null }
): MapCustomer {
  const normalizedEmail = crmUser.salesRepEmail?.toLowerCase() ?? null;
  const assignment = customer.salesReps.find((entry) => {
    const matchesId = crmUser.salesRepId && entry.salesRepId === crmUser.salesRepId;
    const matchesEmail = normalizedEmail && entry.salesRep?.email?.toLowerCase() === normalizedEmail;
    return Boolean(matchesId || matchesEmail);
  }) || customer.salesReps[0];

  const salesRep = assignment?.salesRep;
  const addressParts = [
    customer.street?.trim(),
    [customer.zip, customer.city].filter(Boolean).join(' ').trim(),
    customer.country?.trim()
  ].filter((part) => part && part.length > 0);
  const address = addressParts.length ? addressParts.join(', ') : null;

  const name = `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim()
    || customer.company
    || customer.email;

  const latestInteractionAt = customer.interactions?.[0]?.occurredAt ?? null;
  const lastContactDate = (() => {
    const dates: Date[] = [];
    if (customer.lastContactAt) dates.push(customer.lastContactAt);
    if (latestInteractionAt) dates.push(latestInteractionAt);
    if (dates.length === 0) return null;
    return dates.reduce((latest, current) => (current > latest ? current : latest));
  })();

  return {
    id: customer.id,
    name,
    email: customer.email,
    phone: customer.phone ?? null,
    address,
    lat: normaliseCoordinateValue(customer.latitude),
    lng: normaliseCoordinateValue(customer.longitude),
    status: 'active',
    company: customer.company ?? null,
    totalRevenue: customer.totalRevenue != null ? customer.totalRevenue.toString() : null,
    orderCount: customer.orderCount ?? null,
    lastContact: lastContactDate ? lastContactDate.toISOString() : null,
    memberSince: customer.createdAt ? customer.createdAt.toISOString() : null,
    discountLevel: null,
    customerNumber: customer.customerNumber ?? null,
    customerGroup: customer.customerGroup ?? null,
    priceGroup: formatPriceGroup(customer.priceGroup) ?? null,
    salesRepresentative: salesRep
      ? {
          id: salesRep.id,
          name: `${salesRep.firstName ?? ''} ${salesRep.lastName ?? ''}`.trim() || salesRep.email
        }
      : null,
    salesRepresentativeEmail: salesRep?.email ?? null,
    updatedAt: customer.updatedAt ? customer.updatedAt.toISOString() : null
  } satisfies MapCustomer;
}

class CustomerAccessError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function mapInteractionToResponse(record: PrismaCustomerInteraction): CustomerInteractionDto {
  const followUp = record.followUpTitle
    ? {
        title: record.followUpTitle,
        dueDate: (record.followUpDueDate ?? record.occurredAt).toISOString(),
        assignee: record.followUpAssignee ?? null,
        priority: (record.followUpPriority ?? 'medium') as FollowUpPriority,
        reminder: (record.followUpReminder ?? 'popup') as FollowUpReminder,
      }
    : null;

  const metadata = record.metadata ? (record.metadata as Record<string, unknown>) : null;

  return {
    id: record.id,
    customerId: record.customerId,
    type: record.type,
    occurredAt: record.occurredAt.toISOString(),
    employee: record.employee ?? null,
    durationSeconds: record.durationSeconds ?? null,
    topic: record.topic ?? null,
    result: record.result ?? null,
    notes: record.notes ?? null,
    attachmentsCount: record.attachmentsCount ?? null,
    followUp,
    metadata,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  } satisfies CustomerInteractionDto;
}

type TaskWithRelations = Prisma.TaskGetPayload<typeof taskFetchArgs>;

function mapTaskToResponse(task: TaskWithRelations): TaskDto {
  const customerName = (() => {
    if (!task.customer) return null;
    const name = `${task.customer.firstName ?? ''} ${task.customer.lastName ?? ''}`.trim();
    return name || task.customer.company || null;
  })();

  const assignedName = formatUserName(task.assignedTo ?? undefined);
  const createdByName = formatUserName(task.createdBy ?? undefined);

  const watchers = task.watchers?.map((entry) => ({
    id: entry.id,
    userId: entry.userId,
    name: formatUserName(entry.user ?? undefined) ?? entry.user?.email ?? '',
    email: entry.user?.email ?? '',
    joinedAt: entry.createdAt.toISOString(),
  })) ?? [];

  const attachments = task.attachments?.map((attachment) => ({
    id: attachment.id,
    taskId: attachment.taskId,
    fileName: attachment.fileName,
    fileUrl: attachment.fileUrl,
    uploadedBy: attachment.uploadedBy,
    uploadedByName: formatUserName(attachment.uploader ?? undefined),
    uploadedAt: attachment.uploadedAt.toISOString(),
  })) ?? [];

  const predecessors: TaskDependencyEdge[] = task.dependenciesTo?.map((dependency) => ({
    taskId: task.id,
    relatedTaskId: dependency.predecessorId,
    direction: 'predecessor',
    relationType: dependency.relationType ?? null,
  })) ?? [];

  const successors: TaskDependencyEdge[] = task.dependenciesFrom?.map((dependency) => ({
    taskId: task.id,
    relatedTaskId: dependency.successorId,
    direction: 'successor',
    relationType: dependency.relationType ?? null,
  })) ?? [];

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    category: task.category,
    customerId: task.customerId,
    customerName,
    customerCompany: task.customer?.company ?? null,
    customerNumber: task.customer?.customerNumber ?? null,
    assignedToId: task.assignedToId,
    assignedToName: assignedName,
    createdById: task.createdById,
    createdByName,
    startAt: task.startAt ? task.startAt.toISOString() : null,
    dueAt: task.dueAt ? task.dueAt.toISOString() : null,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    startedAt: task.startedAt ? task.startedAt.toISOString() : null,
    slaMinutes: task.slaMinutes ?? null,
    metadata: task.metadata ? (task.metadata as Record<string, unknown>) : null,
    predecessors,
    successors,
    watchers,
    attachments,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  } satisfies TaskDto;
}

async function ensureCustomerAccess(customerId: string, crmUserId: string) {
  const crmUser = await prisma.crmUser.findUnique({ where: { id: crmUserId } });

  if (!crmUser) {
    throw new CustomerAccessError(404, 'USER_NOT_FOUND', 'Benutzer wurde nicht gefunden');
  }

  const normalizedEmail = crmUser.salesRepEmail?.toLowerCase() ?? null;

  let customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: customerRelationInclude,
  });

  let isAssigned = customer
    ? isCustomerAssignedToUser(customer, {
        salesRepId: crmUser.salesRepId,
        salesRepEmail: crmUser.salesRepEmail,
        role: crmUser.role,
      })
    : false;

  if ((!customer || !isAssigned) && (crmUser.salesRepId || normalizedEmail)) {
    await syncCustomersFromShopware(
      {
        id: crmUser.id,
        salesRepEmail: crmUser.salesRepEmail,
        salesRepId: crmUser.salesRepId,
      },
      normalizedEmail,
      [customerId]
    );

    customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: customerRelationInclude,
    });

    isAssigned = customer
      ? isCustomerAssignedToUser(customer, {
          salesRepId: crmUser.salesRepId,
          salesRepEmail: crmUser.salesRepEmail,
          role: crmUser.role,
        })
      : false;
  }

  if (!customer) {
    throw new CustomerAccessError(404, 'CUSTOMER_NOT_FOUND', 'Kunde wurde nicht gefunden');
  }

  if (!isAssigned) {
    throw new CustomerAccessError(403, 'FORBIDDEN', 'Kein Zugriff auf diese Kundenakte');
  }

  return { customer, crmUser };
}

async function fetchAddresses(addressIds: string[]) {
  const result = new Map<string, any>();
  if (addressIds.length === 0) {
    return result;
  }

  const uniqueIds = Array.from(new Set(addressIds.filter(Boolean)));
  const chunkSize = 25;

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;

    try {
      const response = await adminSearch<any>('/search/customer-address', {
        filter: [
          {
            type: 'equalsAny',
            field: 'id',
            value: chunk.join('|')
          }
        ],
        limit: chunk.length,
        includes: {
          customer_address: [
            'id',
            'firstName',
            'lastName',
            'street',
            'zipcode',
            'city',
            'phoneNumber',
            'latitude',
            'longitude',
            'countryId'
          ],
          country: ['id', 'name']
        },
        associations: {
          country: {}
        }
      });

      for (const address of response?.data ?? []) {
        if (address?.id) {
          result.set(String(address.id), address);
        }
      }
    } catch (error) {
      console.error('Failed to fetch customer addresses from Shopware Admin API', {
        chunkSize: chunk.length,
        error
      });
    }
  }

  return result;
}

async function fetchCustomerGroups(groupIds: string[]) {
  const result = new Map<string, { id: string; name: string | null; translated?: Record<string, any> | null }>();
  if (groupIds.length === 0) {
    return result;
  }

  const uniqueIds = Array.from(new Set(groupIds.filter(Boolean)));
  const chunkSize = 25;

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;

    try {
      const response = await adminSearch<any>('/search/customer-group', {
        filter: [
          {
            type: 'equalsAny',
            field: 'id',
            value: chunk.join('|')
          }
        ],
        limit: chunk.length,
        includes: {
          customer_group: ['id', 'name', 'translated']
        }
      });

      for (const group of response?.data ?? []) {
        if (group?.id) {
          result.set(String(group.id), {
            id: String(group.id),
            name: group.name ?? group.translated?.name ?? null,
            translated: group.translated ?? null
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch customer groups from Shopware Admin API', {
        chunkSize: chunk.length,
        error
      });
    }
  }

  return result;
}

function formatPriceGroup(value: unknown): string | null {
  if (!value) return null;
  const stringValue = String(value);
  const match = stringValue.match(/vk(?:[_\s-]*price)?[_\s-]*(\d+)/i);
  if (match && match[1]) {
    return `VK ${match[1]}`;
  }
  return stringValue || null;
}

interface ParsedOrderLineItem {
  id: string;
  label: string | null;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  taxRate: number | null;
  productId: string | null;
  productNumber: string | null;
  manufacturerId: string | null;
  propertyIds: string[];
  payload: Record<string, any> | null;
}

function parseOrderLineItem(item: Record<string, any>): ParsedOrderLineItem {
  let payload: Record<string, any> | null = null;
  if (item?.payload) {
    if (typeof item.payload === 'string') {
      try {
        payload = JSON.parse(item.payload);
      } catch (parseError) {
        payload = null;
      }
    } else if (typeof item.payload === 'object') {
      payload = item.payload as Record<string, any>;
    }
  }

  const quantity = Number(toNumber(item?.quantity ?? item?.price?.quantity) ?? 0);
  const unitPrice = toNumber(item?.unitPrice ?? item?.price?.unitPrice);
  const totalPrice = toNumber(
    item?.totalPrice ??
    item?.price?.totalPrice ??
    (unitPrice != null ? unitPrice * quantity : null)
  );
  const taxRules = Array.isArray(item?.price?.taxRules) ? item.price.taxRules : [];
  const taxRate = toNumber(taxRules[0]?.taxRate ?? item?.taxRate);

  const productId = toStringOrNull(item?.productId ?? payload?.productId);
  const productNumber = toStringOrNull(payload?.productNumber ?? item?.productNumber);
  const manufacturerId = toStringOrNull(payload?.manufacturerId ?? payload?.productManufacturerId);
  const rawPropertyIds = Array.isArray(payload?.propertyIds) ? payload?.propertyIds : [];
  const propertyIds = rawPropertyIds
    .map((value: unknown) => toStringOrNull(value))
    .filter((value): value is string => Boolean(value));

  return {
    id: toStringOrNull(item?.id) ?? randomUUID(),
    label: toStringOrNull(item?.label) ?? toStringOrNull(payload?.label ?? payload?.name) ?? null,
    quantity,
    unitPrice,
    totalPrice,
    taxRate,
    productId,
    productNumber,
    manufacturerId,
    propertyIds,
    payload
  } satisfies ParsedOrderLineItem;
}

function normaliseLineItemSource(source: unknown): Record<string, any>[] {
  if (!source) {
    return [];
  }

  if (Array.isArray(source)) {
    return source.filter((entry): entry is Record<string, any> => Boolean(entry) && typeof entry === 'object');
  }

  if (typeof source === 'object') {
    const record = source as Record<string, any>;
    if (Array.isArray(record.elements)) {
      return normaliseLineItemSource(record.elements);
    }
    if (Array.isArray(record.data)) {
      return normaliseLineItemSource(record.data);
    }
    if (Array.isArray(record.results)) {
      return normaliseLineItemSource(record.results);
    }
  }

  return [];
}

function collectEmbeddedLineItems(order: Record<string, any>): Record<string, any>[] {
  const seen = new Set<string>();
  const results: Record<string, any>[] = [];

  const register = (entries: Record<string, any>[]) => {
    for (const entry of entries) {
      const id = toStringOrNull(entry?.id) ?? null;
      const dedupeKey = id ?? JSON.stringify(entry ?? {});
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      results.push(entry);
    }
  };

  const candidates = [
    order?.lineItems,
    order?.lineItems?.elements,
    order?.lineItems?.data,
    order?.line_items,
    order?.line_items?.elements,
    order?.line_items?.data,
    order?.extensions?.lineItems,
    order?.extensions?.lineItems?.elements,
    order?.extensions?.lineItems?.data,
    order?.extensions?.line_items,
    order?.extensions?.line_items?.elements,
    order?.extensions?.line_items?.data
  ];

  for (const candidate of candidates) {
    register(normaliseLineItemSource(candidate));
  }

  return results;
}

function normaliseVolumeValue(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower.includes('ml') || lower.includes('milliliter')) {
    return trimmed;
  }
  if (lower.includes('l') && !/ml/.test(lower)) {
    return trimmed;
  }

  const numeric = Number.parseFloat(trimmed.replace(',', '.'));
  if (Number.isFinite(numeric)) {
    if (numeric >= 10) {
      return `${Number.isInteger(numeric) ? numeric.toFixed(0) : numeric} ml`;
    }
    return `${numeric} l`;
  }

  return trimmed;
}

type ProductInfo = {
  manufacturerId: string | null;
  customFields: Record<string, any> | null;
};

type PropertyOptionInfo = {
  name: string | null;
  groupName: string | null;
};

function extractStringValue(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toString() : null;
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const extracted = extractStringValue(entry);
      if (extracted) {
        return extracted;
      }
    }
    return null;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;

    const candidateKeys = [
      'rendered',
      'label',
      'name',
      'value',
      'displayName',
      'title',
      'text'
    ];

    for (const key of candidateKeys) {
      if (key in record) {
        const extracted = extractStringValue(record[key]);
        if (extracted) {
          return extracted;
        }
      }
    }

    if ('translated' in record && record.translated && typeof record.translated === 'object') {
      const translatedValue = extractStringValue(record.translated);
      if (translatedValue) {
        return translatedValue;
      }
    }

    if ('amount' in record && 'unit' in record) {
      const amountValue = extractStringValue(record.amount);
      const unitValue = extractStringValue(record.unit);
      if (amountValue && unitValue) {
        return `${amountValue} ${unitValue}`;
      }
      if (amountValue) {
        return amountValue;
      }
    }

    return null;
  }

  return null;
}

function pickCustomFieldValue(
  sources: Array<Record<string, any> | null | undefined>,
  keys: string[]
): string | null {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      const value = extractStringValue((source as Record<string, any>)[key]);
      if (value) {
        return value;
      }
    }
  }
  return null;
}

function collectPayloadOptions(payload: Record<string, any> | null): Array<Record<string, any>> {
  if (!payload) {
    return [];
  }

  const result: Record<string, any>[] = [];
  const seen = new Set<string>();

  const addOption = (option: unknown) => {
    if (!option || typeof option !== 'object') {
      return;
    }
    const record = option as Record<string, any>;
    const groupLabel = toStringOrNull(record.group?.name ?? record.group?.translated?.name ?? record.groupName);
    const optionLabel =
      extractStringValue(record.name) ??
      extractStringValue(record.value) ??
      extractStringValue(record.label);
    const derivedIdentifier = groupLabel || optionLabel
      ? JSON.stringify({ group: groupLabel, name: optionLabel })
      : null;

    const identifier =
      toStringOrNull(record.id) ||
      toStringOrNull(record.name) ||
      derivedIdentifier;
    if (identifier && seen.has(identifier)) {
      return;
    }
    if (identifier) {
      seen.add(identifier);
    }
    result.push(record);

    if (record.options) {
      traverse(record.options);
    }
    if (record.option) {
      traverse(record.option);
    }
  };

  const traverse = (value: unknown): void => {
    if (!value) {
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        traverse(entry);
      }
      return;
    }
    if (typeof value === 'object') {
      addOption(value);
      return;
    }
  };

  const sources = [
    payload.options,
    payload.option,
    payload.variantOptions,
    payload.variantConfiguration,
    payload.variantConfiguration?.options,
    payload.configuratorSettings,
    payload.configuratorOptions,
    payload.propertyOptions,
    payload.properties,
    payload.variant,
    payload.variant?.options,
    payload.variant?.option,
    payload.variant?.properties,
    payload.variant?.configuratorOptions,
    payload.variant?.configuratorSettings,
    payload.variant?.product,
    payload.variant?.product?.options,
    payload.variant?.product?.configuratorOptions,
    payload.product,
    payload.product?.options,
    payload.product?.configuratorOptions,
    payload.product?.properties,
    payload.parentProduct,
    payload.parentProduct?.options,
    payload.parentProduct?.configuratorOptions,
    payload.parentProduct?.properties
  ];

  for (const source of sources) {
    traverse(source);
  }

  return result;
}

function mapLineItemDetails(
  item: ParsedOrderLineItem,
  manufacturerMap: Map<string, string | null>,
  productMap: Map<string, ProductInfo>,
  propertyOptionMap: Map<string, PropertyOptionInfo>
): CustomerOrderItem {
  const productInfo = item.productId ? productMap.get(item.productId) ?? null : null;
  const customFields = productInfo?.customFields ?? null;
  const payload = item.payload && typeof item.payload === 'object' ? item.payload : null;
  const payloadCustomFields = payload?.customFields && typeof payload.customFields === 'object'
    ? (payload.customFields as Record<string, any>)
    : null;
  const payloadOptions = collectPayloadOptions(payload);
  const variant = payload && typeof payload.variant === 'object' ? (payload.variant as Record<string, any>) : null;
  const variantCustomFields = variant?.customFields && typeof variant.customFields === 'object'
    ? (variant.customFields as Record<string, any>)
    : null;
  const variantTranslatedCustomFields = variant?.translated?.customFields && typeof variant.translated.customFields === 'object'
    ? (variant.translated.customFields as Record<string, any>)
    : null;
  const productPayload = payload && typeof payload.product === 'object' ? (payload.product as Record<string, any>) : null;
  const productCustomFieldsFromPayload = productPayload?.customFields && typeof productPayload.customFields === 'object'
    ? (productPayload.customFields as Record<string, any>)
    : null;
  const productTranslatedCustomFieldsFromPayload = productPayload?.translated?.customFields && typeof productPayload.translated.customFields === 'object'
    ? (productPayload.translated.customFields as Record<string, any>)
    : null;
  const parentProductPayload = payload && typeof payload.parentProduct === 'object' ? (payload.parentProduct as Record<string, any>) : null;
  const parentProductCustomFields = parentProductPayload?.customFields && typeof parentProductPayload.customFields === 'object'
    ? (parentProductPayload.customFields as Record<string, any>)
    : null;
  const parentProductTranslatedCustomFields = parentProductPayload?.translated?.customFields && typeof parentProductPayload.translated.customFields === 'object'
    ? (parentProductPayload.translated.customFields as Record<string, any>)
    : null;
  const customFieldSources = [
    customFields,
    payloadCustomFields,
    variantCustomFields,
    variantTranslatedCustomFields,
    productCustomFieldsFromPayload,
    productTranslatedCustomFieldsFromPayload,
    parentProductCustomFields,
    parentProductTranslatedCustomFields
  ];

  const effectiveManufacturerId = item.manufacturerId ?? productInfo?.manufacturerId ?? null;
  let manufacturer = effectiveManufacturerId ? manufacturerMap.get(effectiveManufacturerId) ?? null : null;
  if (!manufacturer && payload) {
    manufacturer =
      toStringOrNull(payload.manufacturer) ??
      toStringOrNull(payload.manufacturerName) ??
      toStringOrNull(payload?.manufacturer?.name) ??
      toStringOrNull(payload?.product?.manufacturer?.name) ??
      null;
  }

  const propertyEntries = item.propertyIds
    .map((id) => propertyOptionMap.get(id))
    .filter((entry): entry is PropertyOptionInfo => Boolean(entry));

  const findPropertyByGroup = (keywords: string[]) => {
    return propertyEntries.find((entry) => {
      const group = entry.groupName?.toLowerCase() ?? '';
      return keywords.some((keyword) => group.includes(keyword));
    });
  };

  const findPayloadOptionByGroup = (keywords: string[]) => {
    return payloadOptions.find((option: Record<string, any>) => {
      const groupName =
        toStringOrNull(option?.group?.name ?? option?.group?.translated?.name ?? option?.groupName ?? option?.group) ?? '';
      const normalisedGroup = groupName.toLowerCase();
      return keywords.some((keyword) => normalisedGroup.includes(keyword));
    });
  };

  const vintageEntry = findPropertyByGroup(['jahrgang', 'vintage']);
  let vintage = vintageEntry?.name ?? null;
  if (!vintage) {
    vintage = pickCustomFieldValue(customFieldSources, [
      'vinaturel_product_vintage',
      'vinaturel_wine_vintage',
      'vinaturel_wine_year',
      'vinaturel_default_vintage',
      'vintage',
      'jahrgang',
      'year'
    ]);
  }
  if (!vintage && payload) {
    vintage =
      toStringOrNull(payload.vintage) ??
      toStringOrNull(payload.year) ??
      toStringOrNull(payload.jahrgang) ??
      toStringOrNull(variant?.vintage) ??
      toStringOrNull(variant?.year) ??
      toStringOrNull(variant?.jahrgang);
  }
  if (!vintage) {
    const option = findPayloadOptionByGroup(['jahrgang', 'vintage']);
    if (option) {
      vintage = toStringOrNull(option?.name ?? option?.translated?.name ?? option?.value ?? option?.label) ?? null;
    }
  }

  const volumeEntry = findPropertyByGroup(['volumen', 'volume', 'füllmenge']);
  let volume = volumeEntry?.name ?? null;
  if (!volume) {
    volume = pickCustomFieldValue(customFieldSources, [
      'vinaturel_product_volume',
      'vinaturel_product_volume_in_ml',
      'vinaturel_product_volume_ml',
      'vinaturel_product_volume_litre',
      'vinaturel_wine_volume',
      'volume',
      'inhalt',
      'content',
      'vinaturel_default_volume'
    ]);
  }
  if (!volume && payload) {
    volume =
      toStringOrNull(payload.volume) ??
      toStringOrNull(payload.volumeLabel) ??
      toStringOrNull(payload.unitName) ??
      toStringOrNull(payload.unit ?? payload.packUnit ?? payload.packUnitName ?? payload.content) ??
      toStringOrNull(variant?.volume) ??
      toStringOrNull(variant?.content) ??
      toStringOrNull(variant?.unitName) ??
      toStringOrNull(productPayload?.volume) ??
      toStringOrNull(productPayload?.content) ??
      toStringOrNull(parentProductPayload?.volume) ??
      toStringOrNull(parentProductPayload?.content);
  }
  if (!volume) {
    const option = findPayloadOptionByGroup(['volumen', 'volume', 'füllmenge', 'inhalt']);
    if (option) {
      volume =
        toStringOrNull(option?.name ?? option?.translated?.name ?? option?.value ?? option?.label ?? option?.content) ??
        null;
    }
  }
  volume = normaliseVolumeValue(volume);

  const details = {
    id: item.id,
    label: item.label,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
    productId: item.productId,
    productNumber: item.productNumber,
    manufacturer,
    vintage,
    volume,
    taxRate: item.taxRate,
  } satisfies CustomerOrderItem;

  return details;
}

type PropertyMap = Map<string, Set<string>>;

function collectProductPropertyValues(product: Record<string, any>): PropertyMap {
  const values: PropertyMap = new Map();

  const addValue = (key: string | null, value: string | null) => {
    if (!key || !value) return;
    const normalisedKey = key.trim().toLowerCase();
    if (!normalisedKey) return;
    const bucket = values.get(normalisedKey) ?? new Set<string>();
    bucket.add(value);
    values.set(normalisedKey, bucket);
  };

  const properties = Array.isArray(product?.properties) ? product.properties : [];
  for (const property of properties) {
    const groupCustomField = toStringOrNull(property?.group?.customFields?.vinaturel_property_config_technical_name);
    const groupName = toStringOrNull(property?.group?.name);
    const optionName = toStringOrNull(property?.translated?.name ?? property?.name);
    addValue(groupCustomField ?? groupName, optionName);
  }

  const productExtensions = product?.extensions?.vinaturelProductProperties;
  if (productExtensions && typeof productExtensions === 'object') {
    for (const [key, entries] of Object.entries(productExtensions as Record<string, unknown>)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        const name = toStringOrNull((entry as Record<string, unknown>).name);
        addValue(key, name);
      }
    }
  }

  return values;
}

function readPropertyValues(map: PropertyMap, keys: string[]): string[] {
  const collected: string[] = [];
  for (const key of keys) {
    const bucket = map.get(key.toLowerCase());
    if (!bucket) continue;
    bucket.forEach((value) => {
      if (!collected.includes(value)) {
        collected.push(value);
      }
    });
  }
  return collected;
}

function readFirstPropertyValue(map: PropertyMap, keys: string[]): string | null {
  const values = readPropertyValues(map, keys);
  return values.length > 0 ? values[0] : null;
}

function buildPriceTiersFromProduct(product: Record<string, any>): CatalogPriceTier[] {
  const customFields = (product?.customFields && typeof product.customFields === 'object')
    ? (product.customFields as Record<string, unknown>)
    : {};

  const tiers: CatalogPriceTier[] = [];
  const seen = new Set<string>();

  const appendTier = (tier: string, value: number | null) => {
    const normalised = tier.trim().toUpperCase();
    if (!normalised || seen.has(normalised)) return;
    seen.add(normalised);
    tiers.push({
      tier: normalised,
      label: normalised,
      value,
      currency: 'EUR',
    });
  };

  const vk1Candidate = toNumber(customFields?.vinaturel_tier_pricing_vk_net_price_1)
    ?? toNumber(product?.price?.[0]?.gross)
    ?? toNumber(product?.price?.[0]?.net);
  appendTier('VK1', vk1Candidate);

  for (let i = 2; i <= 10; i += 1) {
    const key = `vinaturel_tier_pricing_vk_net_price_${i}`;
    const value = toNumber(customFields?.[key]);
    if (value != null && value !== 0) {
      appendTier(`VK${i}`, value);
    }
  }

  if (tiers.length === 0) {
    const fallbackPrice = toNumber(product?.price?.[0]?.gross);
    appendTier('VK1', fallbackPrice);
  }

  return tiers;
}

function extractAllocationInfo(product: Record<string, any>) {
  const customFields = (product?.customFields && typeof product.customFields === 'object')
    ? (product.customFields as Record<string, unknown>)
    : {};

  const quantity = toNumber(
    customFields?.vinaturel_product_allocation_reserved_quantity
      ?? customFields?.vinaturel_allocation_reserved_quantity
      ?? customFields?.vinaturel_allocation_quantity
  );
  if (!quantity || quantity <= 0) {
    return null;
  }

  const note = toStringOrNull(
    customFields?.vinaturel_product_allocation_note
      ?? customFields?.vinaturel_allocation_note
  );

  return {
    quantity: Math.round(quantity),
    note,
  };
}

function mapProductToCatalogSummary(product: Record<string, any>): CatalogSummaryItem {
  const propertyMap = collectProductPropertyValues(product);

  const grapes = readPropertyValues(propertyMap, ['grapes', 'rebsorten']);
  const certifications = readPropertyValues(propertyMap, ['certification', 'bio', 'demeter']);
  const country = readFirstPropertyValue(propertyMap, ['country', 'land']);
  const region = readFirstPropertyValue(propertyMap, ['region']);
  let vintage = readFirstPropertyValue(propertyMap, ['year', 'jahrgang', 'vintage']);
  let volume = readFirstPropertyValue(propertyMap, ['volume', 'volumen', 'füllmenge']);

  const translatedCustomFields = product?.translated?.customFields && typeof product.translated.customFields === 'object'
    ? (product.translated.customFields as Record<string, any>)
    : null;
  const customFields = (product?.customFields && typeof product.customFields === 'object')
    ? (product.customFields as Record<string, any>)
    : null;

  const customFieldSources = [customFields, translatedCustomFields];

  if (!vintage) {
    vintage = pickCustomFieldValue(customFieldSources, [
      'vinaturel_product_vintage',
      'vinaturel_wine_vintage',
      'vinaturel_wine_year',
      'vinaturel_default_vintage',
      'vintage',
      'jahrgang',
    ]);
  }

  if (!volume) {
    volume = pickCustomFieldValue(customFieldSources, [
      'vinaturel_product_volume',
      'vinaturel_product_volume_in_ml',
      'vinaturel_product_volume_ml',
      'vinaturel_product_volume_litre',
      'vinaturel_wine_volume',
      'volume',
      'inhalt',
      'content',
      'vinaturel_default_volume',
    ]);
  }

  volume = normaliseVolumeValue(volume);

  // Manufacturer fallback chain
  const manufacturerName =
    toStringOrNull(product?.manufacturer?.name)
    ?? toStringOrNull(product?.translated?.manufacturer?.name)
    ?? pickCustomFieldValue(customFieldSources, [
      'vinaturel_winery_name',
      'vinaturel_winery',
      'vinaturel_wine_estate',
      'vinaturel_producer',
    ])
    ?? toStringOrNull(product?.customFields?.winery)
    ?? null;

  const priceTiers = buildPriceTiersFromProduct(product);
  const allocation = extractAllocationInfo(product);

  const galleryImages = Array.isArray(product?.media)
    ? product.media
        .map((entry: any) => normaliseMediaUrl(toStringOrNull(entry?.media?.url ?? entry?.url)))
        .filter((value): value is string => Boolean(value))
    : [];

  const coverImage = normaliseMediaUrl(toStringOrNull(product?.cover?.media?.url ?? product?.cover?.url));
  if (coverImage) {
    galleryImages.unshift(coverImage);
  }

  const uniqueImages = Array.from(new Set(galleryImages));
  const image = uniqueImages[0] ?? null;

  const summary: CatalogSummaryItem = {
    id: toStringOrNull(product?.id) ?? randomUUID(),
    articleNumber: toStringOrNull(product?.productNumber),
    winery: manufacturerName,
    wineName: toStringOrNull(product?.translated?.name ?? product?.name),
    vintage,
    volume,
    stock: toNumber(product?.stock),
    availableStock: toNumber(product?.availableStock),
    country,
    region,
    grapes,
    certifications,
    prices: priceTiers,
    image,
    images: uniqueImages,
    allocation,
  };

  return summary;
}

type ProductSalesInsights = {
  averageMonthlySales: number | null;
  monthsOfStock: number | null;
  monthlyBreakdown: CatalogMonthlySalesPoint[];
};

type AssignedCustomerInfo = {
  crmId: string;
  shopwareId: string | null;
  email: string | null;
};

type AssignedCustomerIndex = {
  byShopwareId: Map<string, AssignedCustomerInfo>;
  byEmail: Map<string, AssignedCustomerInfo>;
};

function mapProductToCatalogDetail(
  product: Record<string, any>,
  topCustomers: CatalogTopCustomer[],
  stockHistory: CatalogStockHistoryPoint[],
  salesInsights: ProductSalesInsights,
): CatalogDetailItem {
  const summary = mapProductToCatalogSummary(product);

  const customFields = (product?.customFields && typeof product.customFields === 'object')
    ? (product.customFields as Record<string, any>)
    : null;
  const translatedDescription = toStringOrNull(product?.translated?.description ?? product?.description);
  const tastingNotes = toStringOrNull(customFields?.vinaturel_tasting_notes_text ?? customFields?.vinaturel_product_description);

  const detail: CatalogDetailItem = {
    ...summary,
    description: tastingNotes ?? translatedDescription,
    stockHistory,
    topCustomers,
    averageMonthlySales: salesInsights.averageMonthlySales,
    monthsOfStock: salesInsights.monthsOfStock,
    monthlySales: salesInsights.monthlyBreakdown,
  };

  return detail;
}

const PRODUCT_SUMMARY_INCLUDES = {
  product: [
    'id',
    'productNumber',
    'stock',
    'availableStock',
    'manufacturerId',
    'manufacturer',
    'properties',
    'options',
    'customFields',
    'price',
    'translated',
    'coverId',
    'cover',
    'media',
  ],
  product_translation: ['name', 'description', 'customFields'],
  product_manufacturer: ['id', 'name'],
  property_group_option: ['id', 'name', 'customFields', 'group'],
  property_group: ['id', 'name', 'customFields'],
  product_media: ['id', 'mediaId', 'position', 'media'],
  media: ['id', 'url'],
} as const;

const PRODUCT_SUMMARY_ASSOCIATIONS = {
  manufacturer: {},
  properties: {
    associations: {
      group: {},
    },
  },
  translations: {},
  prices: {
    associations: {
      rule: {},
    },
  },
  cover: {
    associations: {
      media: {},
    },
  },
  media: {
    limit: 20,
    associations: {
      media: {},
    },
  },
} as const;

async function fetchProductsByIds(productIds: string[]): Promise<Map<string, Record<string, any>>> {
  const map = new Map<string, Record<string, any>>();
  const unique = Array.from(new Set(productIds.filter((value): value is string => Boolean(value))));
  if (unique.length === 0) {
    return map;
  }

  const chunkSize = 25;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;

    try {
      const response = await adminSearch<any>('/search/product', {
        filter: [
          {
            type: 'equalsAny',
            field: 'id',
            value: chunk.join('|'),
          },
        ],
        limit: chunk.length,
        includes: PRODUCT_SUMMARY_INCLUDES,
        associations: PRODUCT_SUMMARY_ASSOCIATIONS,
      });

      for (const product of response?.data ?? []) {
        const productId = toStringOrNull(product?.id);
        if (!productId) continue;
        map.set(productId, product as Record<string, any>);
      }
    } catch (batchError) {
      console.warn('Failed to fetch product batch from Shopware', {
        chunkSize: chunk.length,
        firstProductId: chunk[0],
        error: batchError instanceof Error ? batchError.message : batchError,
      });

      for (const singleId of chunk) {
        try {
          const response = await adminSearch<any>('/search/product', {
            filter: [
              {
                type: 'equals',
                field: 'id',
                value: singleId,
              },
            ],
            limit: 1,
            includes: PRODUCT_SUMMARY_INCLUDES,
            associations: PRODUCT_SUMMARY_ASSOCIATIONS,
          });

          const product = response?.data?.[0] ?? null;
          const productId = toStringOrNull(product?.id);
          if (!productId) continue;
          map.set(productId, product as Record<string, any>);
        } catch (singleError) {
          console.warn('Failed to fetch product for assortment entry', {
            productId: singleId,
            error: singleError instanceof Error ? singleError.message : singleError,
          });
        }
      }
    }
  }

  return map;
}

async function fetchStockHistoryForProduct(
  productId: string,
  currentStock: number | null,
): Promise<CatalogStockHistoryPoint[]> {
  try {
    const response = await adminSearch<any>('/search/stock-movement', {
      filter: [
        {
          type: 'equals',
          field: 'productId',
          value: productId,
        },
      ],
      sort: [
        {
          field: 'createdAt',
          order: 'ASC',
        },
      ],
      limit: 500,
      includes: {
        stock_movement: [
          'id',
          'createdAt',
          'updatedAt',
          'stock',
          'quantity',
          'payload',
          'sourceStock',
          'targetStock',
          'referenceStock',
        ],
      },
    });

    const movements: Record<string, any>[] = Array.isArray(response?.data) ? response.data : [];
    if (movements.length === 0) {
      return currentStock != null
        ? [createStockHistoryPoint(new Date(), currentStock)]
        : [];
    }

    const timeline = movements
      .map((movement) => {
        const occurredAt = toDate(movement?.createdAt) ?? toDate(movement?.updatedAt);
        const stockAfter = toNumber(movement?.stock ?? movement?.targetStock ?? movement?.referenceStock);
        const delta = toNumber(movement?.quantity);
        const payloadStock = toNumber(movement?.payload?.stock ?? movement?.payload?.targetStock);
        return {
          occurredAt,
          stockAfter,
          delta,
          payloadStock,
        };
      })
      .filter((entry) => entry.occurredAt !== null)
      .sort((a, b) => (a.occurredAt!.getTime() - b.occurredAt!.getTime()));

    if (timeline.length === 0) {
      return currentStock != null
        ? [createStockHistoryPoint(new Date(), currentStock)]
        : [];
    }

    let runningStock: number | null = null;
    const history: CatalogStockHistoryPoint[] = [];

    for (const entry of timeline) {
      const targetStock = entry.stockAfter ?? entry.payloadStock;
      if (targetStock != null) {
        runningStock = targetStock;
      } else if (entry.delta != null) {
        runningStock = (runningStock ?? 0) + entry.delta;
      }

      if (runningStock == null) {
        continue;
      }

      history.push(createStockHistoryPoint(entry.occurredAt!, runningStock));
    }

    const condensed = condenseStockHistory(history);

    if (currentStock != null) {
      const nowPoint = createStockHistoryPoint(new Date(), currentStock);
      if (condensed.length === 0) {
        condensed.push(nowPoint);
      } else {
        const lastPoint = condensed[condensed.length - 1];
        const lastDate = toDate(lastPoint.date);
        const nowDate = nowPointDate(nowPoint);
        if (!lastDate || isSameMonth(lastDate, nowDate)) {
          lastPoint.quantity = currentStock;
          lastPoint.date = nowPoint.date;
        } else {
          condensed.push(nowPoint);
        }
      }
    }

    return condensed;
  } catch (error) {
    console.warn('Failed to fetch stock history for product', {
      productId,
      error: error instanceof Error ? error.message : error,
    });
    return currentStock != null
      ? [createStockHistoryPoint(new Date(), currentStock)]
      : [];
  }
}

function createStockHistoryPoint(date: Date, quantity: number): CatalogStockHistoryPoint {
  return {
    date: date.toISOString(),
    quantity: Math.max(0, Math.round(quantity)),
  };
}

function condenseStockHistory(points: CatalogStockHistoryPoint[]): CatalogStockHistoryPoint[] {
  if (points.length === 0) {
    return [];
  }

  const monthly = new Map<string, CatalogStockHistoryPoint>();

  for (const point of points) {
    const dateObj = toDate(point.date);
    if (!dateObj) {
      continue;
    }
    const monthKey = `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}`;
    const normalizedDate = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), 1));
    monthly.set(monthKey, {
      date: normalizedDate.toISOString(),
      quantity: point.quantity,
    });
  }

  return Array.from(monthly.values()).sort((a, b) => (
    (toDate(a.date)?.getTime() ?? 0) - (toDate(b.date)?.getTime() ?? 0)
  ));
}

function nowPointDate(point: CatalogStockHistoryPoint): Date {
  return toDate(point.date) ?? new Date();
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

async function mapMyAssortmentEntries(
  entries: Array<Record<string, any>>
): Promise<CustomerWishlistEntry[]> {
  if (!entries || entries.length === 0) {
    return [];
  }

  const productIds = entries
    .map((entry) => toStringOrNull(entry?.productId))
    .filter((value): value is string => Boolean(value));

  const productMap = await fetchProductsByIds(productIds);

  const normaliseDate = (value: unknown): string | null => {
    if (!value) return null;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString();
  };

  const items: CustomerWishlistEntry[] = [];

  for (const entry of entries) {
    const entryId =
      toStringOrNull(entry?.id)
      ?? toStringOrNull((entry as Record<string, any>)?._uniqueIdentifier ?? null);
    const productId = toStringOrNull(entry?.productId);
    if (!productId) {
      continue;
    }

    const product = ((entry?.product && typeof entry.product === 'object'
      ? (entry.product as Record<string, any>)
      : null) || productMap.get(productId)) ?? null;

    if (!product) {
      continue;
    }

    const summary = mapProductToCatalogSummary(product);
    const addedAt = normaliseDate(entry?.createdAt ?? entry?.updatedAt ?? null);

    items.push({
      id: entryId ?? productId,
      productId,
      addedAt,
      product: summary,
    });
  }

  items.sort((a, b) => {
    if (!a.addedAt && !b.addedAt) return 0;
    if (!a.addedAt) return 1;
    if (!b.addedAt) return -1;
    return b.addedAt.localeCompare(a.addedAt);
  });

  return items;
}

async function buildAssignedCustomerIndex(
  crmUser: { salesRepId?: string | null; salesRepEmail?: string | null }
): Promise<AssignedCustomerIndex> {
  const index: AssignedCustomerIndex = {
    byShopwareId: new Map(),
    byEmail: new Map(),
  };

  const salesRepFilters: Prisma.CustomerToSalesRepWhereInput[] = [];
  if (crmUser.salesRepId) {
    salesRepFilters.push({ salesRepId: crmUser.salesRepId });
  }
  if (crmUser.salesRepEmail) {
    salesRepFilters.push({ salesRep: { email: crmUser.salesRepEmail } });
  }

  if (salesRepFilters.length === 0) {
    return index;
  }

  const where: Prisma.CustomerWhereInput = {
    salesReps: {
      some: salesRepFilters.length === 1 ? salesRepFilters[0]! : { OR: salesRepFilters },
    },
  };

  try {
    const customers = await prisma.customer.findMany({
      where,
      select: {
        id: true,
        email: true,
        shopwareCustomerId: true,
      },
    });

    for (const customer of customers) {
      const info: AssignedCustomerInfo = {
        crmId: customer.id,
        shopwareId: customer.shopwareCustomerId ?? null,
        email: customer.email?.toLowerCase() ?? null,
      };

      if (info.shopwareId) {
        index.byShopwareId.set(info.shopwareId, info);
      }
      if (info.email) {
        index.byEmail.set(info.email, info);
      }
    }
  } catch (error) {
    console.warn('Failed to build assigned customer index', {
      salesRepId: crmUser.salesRepId,
      salesRepEmail: crmUser.salesRepEmail,
      error: error instanceof Error ? error.message : error,
    });
  }

  return index;
}

async function fetchOrderLineItemsForProduct(
  productId: string,
  options?: { limit?: number; salesRepId?: string | null }
): Promise<Record<string, any>[]> {
  const limit = options?.limit ?? 300;
  const salesRepId = options?.salesRepId ?? null;

  if (!productId) {
    return [];
  }

  const filters: Array<Record<string, unknown>> = [
    {
      type: 'equals',
      field: 'productId',
      value: productId,
    },
    {
      type: 'equals',
      field: 'type',
      value: 'product',
    },
  ];

  if (salesRepId) {
    filters.push({
      type: 'equals',
      field: 'order.orderCustomer.customer.customFields.vinaturel_customer_sales_representative_assignment',
      value: salesRepId,
    });
  }

  const payload = {
    filter: filters,
    limit,
    sort: [
      {
        field: 'order.orderDateTime',
        order: 'DESC' as const,
      },
    ],
    associations: {
      order: {
        associations: {
          orderCustomer: {},
        },
      },
    },
  };

  try {
    const response = await adminSearch<any>('/search/order-line-item', payload);
    return Array.isArray(response?.data) ? response.data : [];
  } catch (error) {
    console.warn('Failed to fetch order line items for product', {
      productId,
      error: error instanceof Error ? error.message : error,
    });
    return [];
  }
}

function buildTopCustomersFromLineItems(
  entries: Record<string, any>[],
  options: {
    assignedIndex?: AssignedCustomerIndex;
    restrictToAssignments?: boolean;
  } = {}
): CatalogTopCustomer[] {
  if (!entries.length) {
    return [];
  }

  const assignedIndex = options.assignedIndex ?? {
    byShopwareId: new Map(),
    byEmail: new Map(),
  };
  const restrictToAssignments = options.restrictToAssignments ?? false;

  const grouped = new Map<string, {
    fallbackId: string;
    name: string;
    lastOrdered: number;
    quantity: number;
    priceTier: string | null;
    shopwareCustomerId: string | null;
    email: string | null;
  }>();

  for (const entry of entries) {
    const parsed = parseOrderLineItem(entry);
    const order = entry?.order;
    const orderCustomer = order?.orderCustomer;
    const shopwareCustomerId = toStringOrNull(orderCustomer?.customerId);
    const email = toStringOrNull(orderCustomer?.email)?.toLowerCase() ?? null;
    const fallbackId = shopwareCustomerId
      ?? email
      ?? toStringOrNull(orderCustomer?.company)
      ?? toStringOrNull(order?.id)
      ?? parsed.id
      ?? randomUUID();

    const company = toStringOrNull(orderCustomer?.company);
    const personName = [
      toStringOrNull(orderCustomer?.firstName),
      toStringOrNull(orderCustomer?.lastName),
    ].filter(Boolean).join(' ');
    const displayName = company || personName || toStringOrNull(orderCustomer?.email) || `Kunde ${fallbackId.slice(0, 6)}`;

    const orderDate = toStringOrNull(order?.orderDateTime);
    const timestamp = orderDate ? Date.parse(orderDate) : Date.now();

    let priceTier: string | null = null;
    const payloadData = parsed.payload ?? null;
    if (payloadData && typeof payloadData === 'object') {
      priceTier = toStringOrNull(
        payloadData.priceGroup
        ?? payloadData.rule?.name
        ?? payloadData.ruleName
        ?? payloadData.priceGroupName
        ?? payloadData.priceGroupLabel
      );

      if (!priceTier && payloadData.customFields && typeof payloadData.customFields === 'object') {
        priceTier = toStringOrNull((payloadData.customFields as Record<string, unknown>).vinaturel_tier_pricing_customer_default_price_group);
      }
    }

    const existing = grouped.get(fallbackId);
    const quantity = parsed.quantity ?? 0;

    if (!existing || timestamp > existing.lastOrdered) {
      grouped.set(fallbackId, {
        fallbackId,
        name: displayName,
        lastOrdered: timestamp,
        quantity,
        priceTier,
        shopwareCustomerId,
        email,
      });
    } else {
      existing.quantity += quantity;
      existing.lastOrdered = Math.max(existing.lastOrdered, timestamp);
      if (!existing.shopwareCustomerId && shopwareCustomerId) {
        existing.shopwareCustomerId = shopwareCustomerId;
      }
      if (!existing.email && email) {
        existing.email = email;
      }
    }
  }

  const results: Array<CatalogTopCustomer & { __sortQuantity: number; __sortTimestamp: number }> = [];

  for (const entry of Array.from(grouped.values())) {
    let assignedInfo: AssignedCustomerInfo | undefined;
    if (entry.shopwareCustomerId) {
      assignedInfo = assignedIndex.byShopwareId.get(entry.shopwareCustomerId);
    }
    if (!assignedInfo && entry.email) {
      assignedInfo = assignedIndex.byEmail.get(entry.email);
    }

    if (restrictToAssignments && !assignedInfo) {
      continue;
    }

    const quantity = Math.max(0, entry.quantity);
    const lastOrderedDate = Number.isFinite(entry.lastOrdered) ? entry.lastOrdered : Date.now();

    results.push({
      id: assignedInfo?.crmId ?? entry.shopwareCustomerId ?? entry.fallbackId,
      crmCustomerId: assignedInfo?.crmId ?? null,
      shopwareCustomerId: assignedInfo?.shopwareId ?? entry.shopwareCustomerId ?? null,
      email: assignedInfo?.email ?? entry.email ?? null,
      name: entry.name,
      lastOrdered: entry.lastOrdered
        ? new Intl.DateTimeFormat('de-DE').format(new Date(entry.lastOrdered))
        : null,
      quantity: Math.round(quantity),
      priceTier: entry.priceTier,
      __sortQuantity: quantity,
      __sortTimestamp: lastOrderedDate,
    });
  }

  return results
    .sort((a, b) => {
      if (b.__sortQuantity !== a.__sortQuantity) {
        return b.__sortQuantity - a.__sortQuantity;
      }
      return b.__sortTimestamp - a.__sortTimestamp;
    })
    .slice(0, 5)
    .map(({ __sortQuantity, __sortTimestamp, ...customer }) => customer);
}

function calculateMonthlySalesInsights(
  entries: Record<string, any>[],
  currentStock: number | null,
  monthsWindow = 6,
): ProductSalesInsights {
  if (monthsWindow <= 0) {
    return {
      averageMonthlySales: null,
      monthsOfStock: null,
      monthlyBreakdown: [],
    };
  }

  const now = new Date();
  const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthKeys: { key: string; date: Date }[] = [];
  const allowedMonths = new Set<string>();
  for (let i = monthsWindow - 1; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - i, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    monthKeys.push({ key, date });
    allowedMonths.add(key);
  }

  const quantityByMonth = new Map<string, number>();

  for (const entry of entries) {
    const parsed = parseOrderLineItem(entry);
    const orderDateRaw = toStringOrNull(entry?.order?.orderDateTime) ?? toStringOrNull(entry?.orderDate);
    const occurredAt = orderDateRaw ? Date.parse(orderDateRaw) : NaN;
    if (Number.isNaN(occurredAt)) {
      continue;
    }
    const date = new Date(occurredAt);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!allowedMonths.has(key)) {
      continue;
    }
    const quantity = Math.max(0, parsed.quantity ?? 0);
    quantityByMonth.set(key, (quantityByMonth.get(key) ?? 0) + quantity);
  }

  const breakdown: CatalogMonthlySalesPoint[] = monthKeys.map(({ key, date }) => ({
    month: key,
    label: new Intl.DateTimeFormat('de-DE', {
      month: 'short',
      year: 'numeric',
    }).format(date),
    quantity: Math.round(quantityByMonth.get(key) ?? 0),
  }));

  const totalQuantity = breakdown.reduce((sum, point) => sum + (point.quantity ?? 0), 0);
  const averageMonthlySales = breakdown.length > 0 ? totalQuantity / breakdown.length : null;

  const monthsOfStock = currentStock != null && averageMonthlySales && averageMonthlySales > 0
    ? currentStock / averageMonthlySales
    : null;

  return {
    averageMonthlySales: averageMonthlySales ?? null,
    monthsOfStock,
    monthlyBreakdown: breakdown,
  };
}

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function toDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp) : null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? new Date(value) : null;
  }

  return null;
}

function toStringOrNull(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const result = String(value).trim();
  return result.length > 0 ? result : null;
}

function normaliseMediaUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  if (!SHOPWARE_BASE_URL) {
    return value;
  }
  return value.startsWith('/') ? `${SHOPWARE_BASE_URL}${value}` : `${SHOPWARE_BASE_URL}/${value}`;
}

function extractQueryParam(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return extractQueryParam(value[0]);
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value && typeof value === 'object' && 'toString' in value) {
    try {
      const converted = (value as { toString: () => string }).toString();
      return converted;
    } catch (error) {
      return undefined;
    }
  }

  return undefined;
}

type DateRangeInclusive = {
  from: Date;
  to: Date;
};

const ANALYTICS_CUSTOMER_GROUPS: AnalyticsCustomerGroup[] = ['all', 'gastro', 'fachhandel', 'endkunden'];

function resolveAnalyticsPeriod(value: string | undefined): AnalyticsPeriodType {
  if (!value) {
    return 'month';
  }

  const normalized = value.toLowerCase();
  if (normalized === 'quarter' || normalized === 'year' || normalized === 'custom' || normalized === 'month') {
    return normalized as AnalyticsPeriodType;
  }

  return 'month';
}

function resolveAnalyticsCustomerGroup(value: string | undefined): AnalyticsCustomerGroup {
  if (!value) {
    return 'all';
  }

  const normalized = value.toLowerCase();
  if ((ANALYTICS_CUSTOMER_GROUPS as readonly string[]).includes(normalized)) {
    return normalized as AnalyticsCustomerGroup;
  }

  if (normalized.includes('gastro')) {
    return 'gastro';
  }

  if (normalized.includes('fach')) {
    return 'fachhandel';
  }

  if (normalized.includes('end')) {
    return 'endkunden';
  }

  return 'all';
}

function normalizeCustomerGroupValue(value: string | null | undefined): AnalyticsCustomerGroup | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.includes('gastro')) {
    return 'gastro';
  }

  if (normalized.includes('fach')) {
    return 'fachhandel';
  }

  if (normalized.includes('end')) {
    return 'endkunden';
  }

  return null;
}

function matchesAnalyticsCustomerGroup(customer: CustomerWithRelations, group: AnalyticsCustomerGroup): boolean {
  if (group === 'all') {
    return true;
  }

  const customerGroup = normalizeCustomerGroupValue(customer.customerGroup);
  return customerGroup === group;
}

function parseDateParam(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = parseISO(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch (error) {
    return null;
  }
}

function ensureRangeOrder(range: DateRangeInclusive): DateRangeInclusive {
  if (range.from <= range.to) {
    return range;
  }

  return {
    from: range.to,
    to: range.from
  } satisfies DateRangeInclusive;
}

function getFiscalYearRange(reference: Date): DateRangeInclusive {
  const year = reference.getMonth() >= 6 ? reference.getFullYear() : reference.getFullYear() - 1;
  const start = startOfDay(new Date(year, 6, 1));
  const end = endOfDay(subMilliseconds(new Date(year + 1, 6, 1), 1));

  return { from: start, to: end } satisfies DateRangeInclusive;
}

type OrderAggregateEntry = {
  id: string;
  customerId: string | null;
  shopwareCustomerId?: string | null;
  amount: number;
  orderDate: Date | null;
  currency: string | null;
  customerName: string | null;
  customerCompany: string | null;
  customerNumber: string | null;
  customerEmail: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  orderNumber: string | null;
};

type CustomerIdentifier = {
  id: string;
  shopwareId?: string | null;
  customerNumber?: string | null;
  email?: string | null;
  displayName?: string | null;
  company?: string | null;
};

type CustomerIndexBundle = {
  customerIndex?: Map<string, CustomerIdentifier>;
  shopwareIndex?: Map<string, string>;
  numberIndex?: Map<string, string>;
  emailIndex?: Map<string, string>;
};

type UnmatchedOrderDebug = {
  id: string | null;
  shopwareId?: string | null;
  number: string | null;
  email: string | null;
  orderId: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
};

async function fetchOrderCustomerDetailsBatch(orderIds: string[]): Promise<Map<string, {
  customerId: string | null;
  customerNumber: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
}>> {
  const unique = Array.from(new Set(orderIds.filter((value): value is string => Boolean(value))));
  const results = new Map<string, {
    customerId: string | null;
    customerNumber: string | null;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
  }>();

  if (unique.length === 0) {
    return results;
  }

  const chunkSize = 25;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;

    const payload = {
      filter: [
        {
          type: 'equalsAny',
          field: 'orderId',
          value: chunk.join('|')
        }
      ],
      limit: chunk.length,
      includes: {
        order_customer: ['id', 'orderId', 'customerId', 'firstName', 'lastName', 'company', 'customerNumber', 'email'],
        customer: ['id', 'firstName', 'lastName', 'company', 'email', 'customerNumber'],
        order: ['id']
      },
      associations: {
        customer: {},
        order: {}
      }
    };

    try {
      const response = await adminSearch<any>('/search/order-customer', payload);
      const data = Array.isArray(response?.data) ? response.data : [];
      for (const item of data) {
        const orderCustomer = item?.orderCustomer ?? item?.order_customer ?? item;
        const customer = orderCustomer?.customer ?? item?.customer ?? {};
        const relatedOrder = orderCustomer?.order ?? item?.order ?? {};

        const orderId =
          toStringOrNull(orderCustomer?.orderId) ||
          toStringOrNull(relatedOrder?.id) ||
          null;

        if (!orderId) {
          continue;
        }

        results.set(orderId, {
          customerId:
            toStringOrNull(orderCustomer?.customerId) ||
            toStringOrNull(customer?.id) ||
            null,
          customerNumber:
            toStringOrNull(orderCustomer?.customerNumber) ||
            toStringOrNull(customer?.customerNumber) ||
            null,
          email:
            toStringOrNull(orderCustomer?.email)?.toLowerCase() ||
            toStringOrNull(customer?.email)?.toLowerCase() ||
            null,
          firstName:
            toStringOrNull(orderCustomer?.firstName) ||
            toStringOrNull(customer?.firstName) ||
            null,
          lastName:
            toStringOrNull(orderCustomer?.lastName) ||
            toStringOrNull(customer?.lastName) ||
            null,
          company:
            toStringOrNull(orderCustomer?.company) ||
            toStringOrNull(customer?.company) ||
            null
        });
      }
    } catch (error) {
      console.warn('Failed to fetch batched order customer details', {
        chunkSize: chunk.length,
        error: error instanceof Error ? error.message : error
      });
    }
  }

  return results;
}

async function fetchOrdersWithinRange(
  customerIds: string[],
  range: DateRangeInclusive,
  indexes?: CustomerIndexBundle
): Promise<{
  orders: OrderAggregateEntry[];
  currency: string | null;
  unmatched: UnmatchedOrderDebug[];
}> {
  if (!Array.isArray(customerIds) || customerIds.length === 0) {
    return { orders: [], currency: null, unmatched: [] };
  }

  const chunkSize = 25;
  const limit = 200;
  const seenOrderIds = new Set<string>();
  const orders: OrderAggregateEntry[] = [];
  let detectedCurrency: string | null = null;
  const unmatched: UnmatchedOrderDebug[] = [];
  const detailTargets: Array<{
    orderId: string;
    entry: OrderAggregateEntry;
    directCustomerId: string | null;
    unmatchedRef: UnmatchedOrderDebug | null;
  }> = [];

  const customerIndex = indexes?.customerIndex ?? new Map<string, CustomerIdentifier>();
  const shopwareIndex = indexes?.shopwareIndex ?? new Map<string, string>();
  const numberIndex = indexes?.numberIndex ?? new Map<string, string>();
  const emailIndex = indexes?.emailIndex ?? new Map<string, string>();

  for (let i = 0; i < customerIds.length; i += chunkSize) {
    const chunk = customerIds.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;

    const chunkNumbers = new Set<string>();
    const chunkEmails = new Set<string>();
    const chunkCrmIds = new Set<string>();

    for (const id of chunk) {
      const crmId = shopwareIndex.get(id) ?? id;
      chunkCrmIds.add(crmId);

      const meta = customerIndex.get(crmId);
      if (meta?.customerNumber) chunkNumbers.add(meta.customerNumber);
      if (meta?.email) chunkEmails.add(meta.email);
    }

    numberIndex.forEach((mappedId, number) => {
      if (chunkCrmIds.has(mappedId)) {
        chunkNumbers.add(number);
      }
    });

    emailIndex.forEach((mappedId, mail) => {
      if (chunkCrmIds.has(mappedId)) {
        chunkEmails.add(mail);
      }
    });

    let page = 1;

    while (true) {
      const queries: Array<Record<string, any>> = [];
      queries.push({
        type: 'equalsAny',
        field: 'orderCustomer.customerId',
        value: chunk.join('|')
      });

      if (chunkNumbers.size > 0) {
        queries.push({
          type: 'equalsAny',
          field: 'orderCustomer.customerNumber',
          value: Array.from(chunkNumbers).join('|')
        });
      }

      if (chunkEmails.size > 0) {
        queries.push({
          type: 'equalsAny',
          field: 'orderCustomer.email',
          value: Array.from(chunkEmails).join('|')
        });
      }

      const payload: Record<string, any> = {
        filter: [
          queries.length === 1
            ? queries[0]
            : {
                type: 'multi',
                operator: 'or',
                queries
              },
          {
            type: 'range',
            field: 'orderDateTime',
            parameters: {
              gte: range.from.toISOString(),
              lte: range.to.toISOString()
            }
          }
        ],
        sort: [
          {
            field: 'orderDateTime',
            order: 'DESC'
          }
        ],
        limit,
        page,
        associations: {
          currency: {},
          orderCustomer: {
            associations: {
              customer: {}
            }
          }
        },
        includes: {
          order: ['id', 'orderNumber', 'orderDateTime', 'createdAt', 'amountTotal', 'price', 'orderCustomerId'],
          currency: ['id', 'isoCode', 'shortName', 'symbol'],
          order_customer: ['id', 'customerId', 'firstName', 'lastName', 'company', 'customerNumber', 'email'],
          customer: ['id', 'firstName', 'lastName', 'company', 'email', 'customerNumber']
        },
        'total-count-mode': 1
      };

      let response: any;
      try {
        response = await adminSearch<any>('/search/order', payload);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const responseData = (error as any)?.response?.data;
        console.warn('Analytics order fetch failed for chunk', {
          chunkSize: chunk.length,
          message,
          response: responseData ?? null,
        });
        break;
      }

      const data = Array.isArray(response?.data) ? response.data : [];
      if (data.length === 0) {
        break;
      }

      const rawOrders = data
        .map((entry: any) => entry?.order ?? entry)
        .filter((order: any): order is Record<string, any> => Boolean(order));

      await hydrateOrdersWithCustomers(rawOrders);

      for (const order of rawOrders) {
        const orderId = toStringOrNull(order?.id);
        if (orderId && seenOrderIds.has(orderId)) {
          continue;
        }

        const orderDateString =
          toStringOrNull(order?.orderDateTime) ||
          toStringOrNull(order?.createdAt);
        const orderDate = orderDateString ? new Date(orderDateString) : null;
        if (orderDate && (orderDate < range.from || orderDate > range.to)) {
          continue;
        }

        if (orderId) {
          seenOrderIds.add(orderId);
        }

        const amount = toNumber(order?.amountTotal ?? order?.price?.totalPrice) ?? 0;

        const currencyCode =
          toStringOrNull(order?.currency?.isoCode) ||
          toStringOrNull(order?.currency?.shortName) ||
          toStringOrNull(order?.currency?.symbol) ||
          null;
        if (!detectedCurrency && currencyCode) {
          detectedCurrency = currencyCode;
        }

        const orderCustomer = order?.orderCustomer ?? order?.order_customer ?? {};
        const orderCustomerEntity = orderCustomer?.customer ?? {};
        const directCustomerId =
          toStringOrNull(orderCustomer?.customerId) ||
          toStringOrNull(orderCustomerEntity?.id) ||
          toStringOrNull(order?.orderCustomerId) ||
          toStringOrNull(order?.customerId) ||
          null;

        let resolvedCustomerId = directCustomerId;
        
        if (resolvedCustomerId) {
          if (!customerIndex.has(resolvedCustomerId) && shopwareIndex.has(resolvedCustomerId)) {
            resolvedCustomerId = shopwareIndex.get(resolvedCustomerId) ?? resolvedCustomerId;
          }
        }
        let customerNumber = toStringOrNull(orderCustomer?.customerNumber) || toStringOrNull(orderCustomerEntity?.customerNumber) || null;
        let customerEmail =
          toStringOrNull(orderCustomer?.email)?.toLowerCase() ||
          toStringOrNull(orderCustomerEntity?.email)?.toLowerCase() ||
          null;
        let orderFirstName =
          toStringOrNull(orderCustomer?.firstName) ||
          toStringOrNull(orderCustomerEntity?.firstName) ||
          null;
        let orderLastName =
          toStringOrNull(orderCustomer?.lastName) ||
          toStringOrNull(orderCustomerEntity?.lastName) ||
          null;
        let orderCompany =
          toStringOrNull(orderCustomer?.company) ||
          toStringOrNull(orderCustomerEntity?.company) ||
          null;

        if (!resolvedCustomerId) {
          if (customerNumber && numberIndex.has(customerNumber)) {
            resolvedCustomerId = numberIndex.get(customerNumber) ?? null;
          }

          if (!resolvedCustomerId && customerEmail && emailIndex.has(customerEmail)) {
            resolvedCustomerId = emailIndex.get(customerEmail) ?? null;
          }

          if (!resolvedCustomerId && directCustomerId && shopwareIndex.has(directCustomerId)) {
            resolvedCustomerId = shopwareIndex.get(directCustomerId) ?? null;
          }
        }

        const lookupEntry = resolvedCustomerId ? customerIndex.get(resolvedCustomerId) : undefined;
        const nameFromIndex = lookupEntry?.company || lookupEntry?.displayName || null;
        const name = [orderFirstName, orderLastName].filter(Boolean).join(' ').trim() || null;
        const finalName =
          nameFromIndex ||
          orderCompany ||
          name ||
          customerNumber ||
          customerEmail ||
          null;
        const finalCompany = orderCompany || lookupEntry?.company || null;
        const orderNumber = toStringOrNull(order?.orderNumber);

        const entry: OrderAggregateEntry = {
          id: orderId ?? randomUUID(),
          customerId: resolvedCustomerId,
          shopwareCustomerId: directCustomerId,
          amount,
          orderDate,
          currency: currencyCode,
          customerName: finalName,
          customerCompany: finalCompany,
          customerNumber,
          customerEmail,
          customerFirstName: orderFirstName,
          customerLastName: orderLastName,
          orderNumber
        };

        orders.push(entry);

        let unmatchedRef: UnmatchedOrderDebug | null = null;
        if (!resolvedCustomerId) {
          unmatchedRef = {
            id: directCustomerId,
            shopwareId: directCustomerId,
            number: customerNumber,
            email: customerEmail,
            orderId: orderId ?? null,
            firstName: orderFirstName,
            lastName: orderLastName,
            company: orderCompany
          };
          unmatched.push(unmatchedRef);
        }

        if (!resolvedCustomerId && orderId) {
          detailTargets.push({
            orderId,
            entry,
            directCustomerId,
            unmatchedRef
          });
        }
      }

      if (data.length < limit) {
        break;
      }

      page += 1;
      if (page > 20) {
        console.warn('Analytics order fetch aborted due to high page count', {
          chunkSize: chunk.length
        });
        break;
      }
    }
  }

  if (detailTargets.length > 0) {
    const detailMap = await fetchOrderCustomerDetailsBatch(detailTargets.map((target) => target.orderId));

    for (const target of detailTargets) {
      const detail = detailMap.get(target.orderId);
      if (!detail) {
        continue;
      }

      const entry = target.entry;

      if (!entry.customerNumber && detail.customerNumber) {
        entry.customerNumber = detail.customerNumber;
      }

      if (!entry.customerEmail && detail.email) {
        entry.customerEmail = detail.email;
      }

      if (!entry.customerCompany && detail.company) {
        entry.customerCompany = detail.company;
      }

      const detailName = [detail.firstName, detail.lastName].filter(Boolean).join(' ').trim() || null;
      if (!entry.customerName || entry.customerName === 'Unbekannter Kunde') {
        const displayCandidate = detail.company || detailName || detail.customerNumber || detail.email;
        if (displayCandidate) {
          entry.customerName = displayCandidate;
        }
      }

      if (!entry.customerFirstName && detail.firstName) {
        entry.customerFirstName = detail.firstName;
      }
      if (!entry.customerLastName && detail.lastName) {
        entry.customerLastName = detail.lastName;
      }

      const possibleShopwareId = detail.customerId || target.directCustomerId || null;
      if (possibleShopwareId && !entry.shopwareCustomerId) {
        entry.shopwareCustomerId = possibleShopwareId;
      }

      let resolvedCustomerId = entry.customerId;

      if (!resolvedCustomerId && possibleShopwareId) {
        resolvedCustomerId =
          shopwareIndex.get(possibleShopwareId) ??
          customerIndex.get(possibleShopwareId)?.id ??
          possibleShopwareId;
      }

      if (!resolvedCustomerId && detail.customerNumber && numberIndex.has(detail.customerNumber)) {
        resolvedCustomerId = numberIndex.get(detail.customerNumber) ?? null;
      }

      if (!resolvedCustomerId && detail.email && emailIndex.has(detail.email)) {
        resolvedCustomerId = emailIndex.get(detail.email) ?? null;
      }

      if (resolvedCustomerId) {
        entry.customerId = resolvedCustomerId;
      }

      if (target.unmatchedRef) {
        if (resolvedCustomerId) {
          const idx = unmatched.indexOf(target.unmatchedRef);
          if (idx >= 0) {
            unmatched.splice(idx, 1);
          }
        } else {
          target.unmatchedRef.id = detail.customerId;
          target.unmatchedRef.shopwareId = detail.customerId;
          target.unmatchedRef.number = detail.customerNumber;
          target.unmatchedRef.email = detail.email;
          target.unmatchedRef.firstName = detail.firstName;
          target.unmatchedRef.lastName = detail.lastName;
          target.unmatchedRef.company = detail.company;
        }
      }
    }
  }

  return { orders, currency: detectedCurrency, unmatched };
}

function resolveAnalyticsRanges(
  period: AnalyticsPeriodType,
  params: { from?: string; to?: string },
  now: Date = new Date()
): { current: DateRangeInclusive; previous: DateRangeInclusive } {
  switch (period) {
    case 'month': {
      const start = startOfDay(startOfMonth(now));
      const end = endOfDay(endOfMonth(now));
      const previousStart = startOfDay(subYears(start, 1));
      const previousEnd = endOfDay(endOfMonth(subYears(start, 1)));
      return {
        current: { from: start, to: end },
        previous: { from: previousStart, to: previousEnd }
      };
    }
    case 'quarter': {
      const start = startOfDay(startOfQuarter(now));
      const end = endOfDay(endOfQuarter(now));
      const previousStart = startOfDay(subYears(start, 1));
      const previousEnd = endOfDay(endOfQuarter(subYears(start, 1)));
      return {
        current: { from: start, to: end },
        previous: { from: previousStart, to: previousEnd }
      };
    }
    case 'year': {
      const current = getFiscalYearRange(now);
      const previousStart = startOfDay(addYears(current.from, -1));
      const previousEnd = endOfDay(subMilliseconds(current.from, 1));
      return {
        current,
        previous: { from: previousStart, to: previousEnd }
      };
    }
    case 'custom':
    default: {
      const fromParam = parseDateParam(params.from);
      const toParam = parseDateParam(params.to);

      const fallbackStart = startOfDay(startOfMonth(now));
      const fallbackEnd = endOfDay(endOfMonth(now));

      const start = startOfDay(fromParam ?? fallbackStart);
      const endReference = toParam ?? fromParam ?? fallbackEnd;
      const end = endOfDay(endReference);

      const ordered = ensureRangeOrder({ from: start, to: end });

      const previousStart = startOfDay(subYears(ordered.from, 1));
      const previousEnd = endOfDay(subYears(ordered.to, 1));

      return {
        current: ordered,
        previous: { from: previousStart, to: previousEnd }
      };
    }
  }
}

async function aggregateOrdersForAnalytics(
  customerIds: string[],
  range: DateRangeInclusive,
  indexes?: CustomerIndexBundle
): Promise<{
  totalAmount: number;
  orderCount: number;
  currency: string | null;
  orders: OrderAggregateEntry[];
  unmatched: UnmatchedOrderDebug[];
}> {
  const { orders, currency, unmatched } = await fetchOrdersWithinRange(customerIds, range, indexes);

  const totalAmount = orders.reduce((sum, entry) => sum + (Number.isFinite(entry.amount) ? entry.amount : 0), 0);

  return {
    totalAmount,
    orderCount: orders.length,
    currency,
    orders,
    unmatched
  };
}

async function syncCustomersFromShopware(
  crmUser: { id: string; salesRepEmail?: string | null; salesRepId?: string | null },
  normalizedEmail?: string | null,
  specificCustomerIds?: string[]
) {
  if (!normalizedEmail && !crmUser.salesRepId && (!specificCustomerIds || specificCustomerIds.length === 0)) {
    return [] as CustomerWithRelations[];
  }

  const queries: Array<Record<string, unknown>> = [];

  if (crmUser.salesRepId) {
    queries.push({ type: 'equals', field: SHOPWARE_ASSIGNMENT_FIELD, value: crmUser.salesRepId });
  }

  if (normalizedEmail) {
    queries.push({ type: 'equals', field: 'customFields.vinaturel_sales_representative_email', value: normalizedEmail });
    queries.push({ type: 'equals', field: 'customFields.sales_representative_email', value: normalizedEmail });
  }

  if (specificCustomerIds && specificCustomerIds.length > 0) {
    queries.push({
      type: 'equalsAny',
      field: 'id',
      value: specificCustomerIds.map((id) => String(id)).join('|')
    });
  }

  if (queries.length === 0) {
    return [] as CustomerWithRelations[];
  }

  const payload = {
    filter: [
      {
        type: 'multi',
        operator: 'or',
        queries
      }
    ],
    limit: 500,
    includes: {
      customer: [
        'id',
        'email',
        'firstName',
        'lastName',
        'company',
        'updatedAt',
        'createdAt',
        'active',
        'customerNumber',
        'orderCount',
        'orderTotalAmount',
        'customFields',
        'defaultBillingAddressId',
        'defaultShippingAddressId',
        'group',
        'groupId'
      ],
      customer_address: [
        'id',
        'firstName',
        'lastName',
        'street',
        'zipcode',
        'city',
        'phoneNumber',
        'latitude',
        'longitude',
        'customFields'
      ],
      country: ['id', 'name'],
      sales_channel: ['id', 'name']
    },
    associations: {
      defaultBillingAddress: {
        associations: {
          country: {}
        }
      },
      defaultShippingAddress: {
        associations: {
          country: {}
        }
      },
      group: {}
    },
    sort: [
      {
        field: 'updatedAt',
        order: 'DESC'
      }
    ]
  };

  let shopwareCustomers: Array<Record<string, any>> = [];
  try {
    const response = await adminSearch<any>('/search/customer', payload);
    shopwareCustomers = response?.data ?? [];
    console.log('Shopware customers fetched for sync', {
      count: shopwareCustomers.length,
      groupIds: Array.from(new Set(shopwareCustomers.map((c) => c.groupId || c.group?.id).filter(Boolean))),
      specificCustomerIds
    });
  } catch (error) {
    console.error('Failed to fetch customers from Shopware Admin API for sync', {
      userId: crmUser.id,
      error
    });
    return [] as CustomerWithRelations[];
  }

  const addressIdSet = new Set<string>();
  for (const customer of shopwareCustomers) {
    if (customer.defaultBillingAddressId) {
      addressIdSet.add(customer.defaultBillingAddressId);
    }
    if (customer.defaultShippingAddressId) {
      addressIdSet.add(customer.defaultShippingAddressId);
    }
  }

  const addressMap = await fetchAddresses(Array.from(addressIdSet));
  const groupIds = shopwareCustomers
    .map((customer) => customer.groupId || customer.group?.id)
    .filter((value): value is string => Boolean(value));
  const groupMap = await fetchCustomerGroups(groupIds);

  const readCustomField = (fields: Record<string, unknown> | null | undefined, keys: string[]) => {
    if (!fields) return undefined;
    for (const key of keys) {
      const value = (fields as Record<string, unknown>)[key];
      if (value !== undefined && value !== null) {
        return value;
      }
    }
    return undefined;
  };

  const normaliseCoordinate = (value: unknown): number | null => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    const parsed = parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  };

  for (const customer of shopwareCustomers) {
    const billing = addressMap.get(String(customer.defaultBillingAddressId))
      || addressMap.get(String(customer.defaultShippingAddressId));
    let latitude = normaliseCoordinate(
      billing?.latitude ??
      readCustomField(billing?.customFields ?? null, ['latitude', 'lat', 'geoLatitude']) ??
      readCustomField(customer.customFields ?? null, ['latitude', 'lat', 'geoLatitude'])
    );

    let longitude = normaliseCoordinate(
      billing?.longitude ??
      readCustomField(billing?.customFields ?? null, ['longitude', 'lng', 'geoLongitude']) ??
      readCustomField(customer.customFields ?? null, ['longitude', 'lng', 'geoLongitude'])
    );

    if ((latitude == null || longitude == null) && (billing?.street || billing?.city)) {
      void (async () => {
        try {
          const geocoded = await geocodeAddress({
            street: billing?.street ?? undefined,
            city: billing?.city ?? undefined,
            zip: billing?.zipcode ?? undefined,
            country:
              billing?.country?.name ??
              (readCustomField(customer.customFields, ['country', 'countryName']) as string | undefined)
          });
          if (geocoded) {
            await prisma.customer.update({
              where: { id: customer.id },
              data: {
                latitude: geocoded.lat,
                longitude: geocoded.lon
              }
            });
          }
        } catch (geocodeError) {
          console.warn('Failed to geocode customer address', {
            customerId: customer.id,
            email: customer.email,
            error: geocodeError instanceof Error ? geocodeError.message : geocodeError
          });
        }
      })();
    }

    const groupName =
      (customer.group?.translated?.name as string | undefined) ??
      customer.group?.name ??
      (customer.groupId ? groupMap.get(String(customer.groupId))?.name ?? null : null);

    const priceGroupValue = readCustomField(customer.customFields, [
      'vinaturel_tier_pricing_customer_default_price_group',
      'vinaturel_sales_representative_price_group',
      'standardPriceGroup'
    ]);
    const priceGroup = formatPriceGroup(priceGroupValue);

    const totalRevenue = customer.orderTotalAmount !== undefined && customer.orderTotalAmount !== null
      ? Number(customer.orderTotalAmount)
      : null;
    const orderCount = customer.orderCount !== undefined && customer.orderCount !== null
      ? Number(customer.orderCount)
      : null;

    await prisma.customer.upsert({
      where: { id: customer.id },
      update: {
        shopwareCustomerId: customer.id,
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
        customerNumber: customer.customerNumber ?? null,
        customerGroup: groupName,
        priceGroup,
        totalRevenue,
        orderCount,
        updatedAt: customer.updatedAt ? new Date(customer.updatedAt) : new Date()
      },
      create: {
        id: customer.id,
        shopwareCustomerId: customer.id,
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
        customerNumber: customer.customerNumber ?? null,
        customerGroup: groupName,
        priceGroup,
        totalRevenue,
        orderCount
      }
    });

    const assignmentId = readCustomField(customer.customFields, [SHOPWARE_ASSIGNMENT_FIELD]);
    const fallbackNumericId = readCustomField(customer.customFields, ['vinaturel_sales_representative_bios_mapping_vertreter_1']);

    if (assignmentId || fallbackNumericId) {
      const resolvedSalesRepId = assignmentId ? String(assignmentId) : `bios:${fallbackNumericId}`;
      const emailForSalesRep = customer.salesRepresentative?.email || normalizedEmail || `rep-${resolvedSalesRepId}@example.com`;

      await prisma.salesRep.upsert({
        where: { id: resolvedSalesRepId },
        update: {
          email: emailForSalesRep,
          firstName: customer.salesRepresentative?.firstName || null,
          lastName: customer.salesRepresentative?.lastName || null,
          updatedAt: new Date()
        },
        create: {
          id: resolvedSalesRepId,
          email: emailForSalesRep,
          firstName: customer.salesRepresentative?.firstName || null,
          lastName: customer.salesRepresentative?.lastName || null
        }
      });

      await prisma.customerToSalesRep.upsert({
        where: {
          salesRepId_customerId: {
            salesRepId: resolvedSalesRepId,
            customerId: customer.id
          }
        },
        update: {},
        create: {
          salesRepId: resolvedSalesRepId,
          customerId: customer.id
        }
      });
    }
  }

  const orConditions: any[] = [];
  if (crmUser.salesRepId) {
    orConditions.push({
      salesReps: {
        some: {
          salesRepId: crmUser.salesRepId
        }
      }
    });
  }

  if (normalizedEmail) {
    orConditions.push({
      salesReps: {
        some: {
          salesRep: {
            email: normalizedEmail
          }
        }
      }
    });
  }

  return prisma.customer.findMany({
    where: {
      OR: orConditions
    },
    include: customerRelationInclude,
    orderBy: {
      updatedAt: 'desc'
    },
    take: 500
  }) as Promise<CustomerWithRelations[]>;
}

interface LoadCustomersResult {
  customers: CustomerWithRelations[];
  synced: boolean;
  hadAssignment: boolean;
  initialCount: number;
  requiresSync: boolean;
}

async function loadAssignedCustomers(
  crmUser: CrmUserContext,
  normalizedEmail: string | null,
  options: { timestamp?: string } = {}
): Promise<LoadCustomersResult> {
  if (hasAllCustomerAccess(crmUser.role)) {
    const customers = await prisma.customer.findMany({
      include: customerRelationInclude,
      orderBy: {
        updatedAt: 'desc',
      },
      take: 500,
    });

    return {
      customers: customers as CustomerWithRelations[],
      synced: false,
      hadAssignment: true,
      initialCount: customers.length,
      requiresSync: false,
    } satisfies LoadCustomersResult;
  }

  const orConditions: any[] = [];

  if (crmUser.salesRepId) {
    orConditions.push({
      salesReps: {
        some: {
          salesRepId: crmUser.salesRepId
        }
      }
    });
  }

  if (normalizedEmail) {
    orConditions.push({
      salesReps: {
        some: {
          salesRep: {
            email: normalizedEmail
          }
        }
      }
    });
  }

  if (orConditions.length === 0) {
    return {
      customers: [],
      synced: false,
      hadAssignment: false,
      initialCount: 0,
      requiresSync: false
    } satisfies LoadCustomersResult;
  }

  let customers = await prisma.customer.findMany({
    where: {
      OR: orConditions
    },
    include: customerRelationInclude,
    orderBy: {
      updatedAt: 'desc'
    },
    take: 500
  });

  const initialCount = customers.length;

  const requiresSync =
    customers.length === 0 ||
    customers.some((record) =>
      (!record.phone && !record.street && !record.city) ||
      !record.customerNumber ||
      !record.customerGroup ||
      !record.priceGroup ||
      record.totalRevenue == null ||
      record.orderCount == null
    );

  let synced = false;

  if (requiresSync) {
    console.log('No customers found in CRM database, attempting to sync from Shopware', {
      userId: crmUser.id,
      existingCount: customers.length,
      timestamp: options.timestamp
    });

    customers = await syncCustomersFromShopware(
      {
        id: crmUser.id,
        salesRepEmail: crmUser.salesRepEmail,
        salesRepId: crmUser.salesRepId
      },
      normalizedEmail ?? null
    );

    console.log('Sync from Shopware completed', {
      userId: crmUser.id,
      syncedCount: customers.length,
      timestamp: options.timestamp
    });

    synced = true;
  }

  const allowedCustomers = (customers as CustomerWithRelations[]).filter((customer) =>
    isCustomerAssignedToUser(customer, {
      salesRepId: crmUser.salesRepId,
      salesRepEmail: crmUser.salesRepEmail,
      role: crmUser.role,
    })
  );

  return {
    customers: allowedCustomers,
    synced,
    hadAssignment: true,
    initialCount,
    requiresSync
  } satisfies LoadCustomersResult;
}

function mapShopwareOrder(order: Record<string, any>, providedLineItems?: CustomerOrderItem[]): CustomerOrderSummary {
  const currencyCode =
    toStringOrNull(order?.currency?.isoCode) ||
    toStringOrNull(order?.currency?.shortName) ||
    toStringOrNull(order?.currency?.symbol);

  let lineItems: CustomerOrderItem[] = [];

  if (providedLineItems) {
    lineItems = providedLineItems;
  } else {
    const lineItemsRaw = Array.isArray(order?.lineItems) ? order.lineItems : [];
    lineItems = lineItemsRaw.map((item: any, index: number) => {
      let payload: Record<string, any> | null = null;
      if (item?.payload) {
        if (typeof item.payload === 'string') {
          try {
            payload = JSON.parse(item.payload);
          } catch (parseError) {
            payload = null;
          }
        } else if (typeof item.payload === 'object') {
          payload = item.payload as Record<string, any>;
        }
      }

      const quantity = toNumber(item?.quantity) ?? 0;
      const unitPrice = toNumber(item?.unitPrice ?? item?.price?.unitPrice);
      const totalPrice = toNumber(
        item?.totalPrice ??
        item?.price?.totalPrice ??
        (unitPrice != null ? unitPrice * quantity : null)
      );
      const taxRules = Array.isArray(item?.price?.taxRules) ? item.price.taxRules : [];
      const taxRate = toNumber(taxRules[0]?.taxRate ?? item?.taxRate);

      const payloadCustomFields = payload?.customFields && typeof payload.customFields === 'object'
        ? (payload.customFields as Record<string, any>)
        : null;
      const payloadOptions = collectPayloadOptions(payload);
      const variant = payload && typeof payload.variant === 'object' ? (payload.variant as Record<string, any>) : null;
      const variantCustomFields = variant?.customFields && typeof variant.customFields === 'object'
        ? (variant.customFields as Record<string, any>)
        : null;
      const variantTranslatedCustomFields = variant?.translated?.customFields && typeof variant.translated.customFields === 'object'
        ? (variant.translated.customFields as Record<string, any>)
        : null;
      const productPayload = payload && typeof payload.product === 'object' ? (payload.product as Record<string, any>) : null;
      const productCustomFieldsFromPayload = productPayload?.customFields && typeof productPayload.customFields === 'object'
        ? (productPayload.customFields as Record<string, any>)
        : null;
      const productTranslatedCustomFieldsFromPayload = productPayload?.translated?.customFields && typeof productPayload.translated.customFields === 'object'
        ? (productPayload.translated.customFields as Record<string, any>)
        : null;
      const parentProductPayload = payload && typeof payload.parentProduct === 'object' ? (payload.parentProduct as Record<string, any>) : null;
      const parentProductCustomFields = parentProductPayload?.customFields && typeof parentProductPayload.customFields === 'object'
        ? (parentProductPayload.customFields as Record<string, any>)
        : null;
      const parentProductTranslatedCustomFields = parentProductPayload?.translated?.customFields && typeof parentProductPayload.translated.customFields === 'object'
        ? (parentProductPayload.translated.customFields as Record<string, any>)
        : null;
      const customFieldSources = [
        payloadCustomFields,
        variantCustomFields,
        variantTranslatedCustomFields,
        productCustomFieldsFromPayload,
        productTranslatedCustomFieldsFromPayload,
        parentProductCustomFields,
        parentProductTranslatedCustomFields
      ];

      let manufacturer =
        toStringOrNull(payload?.manufacturer) ??
        toStringOrNull(payload?.manufacturerName) ??
        toStringOrNull(payload?.manufacturer?.name) ??
        toStringOrNull(payload?.product?.manufacturer?.name) ??
        null;

      const findPayloadOptionByGroup = (keywords: string[]) => {
        return payloadOptions.find((option: Record<string, any>) => {
          const groupName =
            toStringOrNull(option?.group?.name ?? option?.group?.translated?.name ?? option?.groupName ?? option?.group) ?? '';
          const normalisedGroup = groupName.toLowerCase();
          return keywords.some((keyword) => normalisedGroup.includes(keyword));
        });
      };

      let vintage =
        pickCustomFieldValue(customFieldSources, [
          'vinaturel_product_vintage',
          'vinaturel_wine_vintage',
          'vinaturel_wine_year',
          'vinaturel_default_vintage',
          'vintage',
          'jahrgang',
          'year'
        ]) ??
        toStringOrNull(payload?.vintage) ??
        toStringOrNull(payload?.year) ??
        toStringOrNull(payload?.jahrgang) ??
        toStringOrNull(variant?.vintage) ??
        toStringOrNull(variant?.year) ??
        toStringOrNull(variant?.jahrgang);
      if (!vintage) {
        const option = findPayloadOptionByGroup(['jahrgang', 'vintage']);
        if (option) {
          vintage = toStringOrNull(option?.name ?? option?.translated?.name ?? option?.value ?? option?.label) ?? null;
        }
      }

      let volume =
        pickCustomFieldValue(customFieldSources, [
          'vinaturel_product_volume',
          'vinaturel_product_volume_in_ml',
          'vinaturel_product_volume_ml',
          'vinaturel_product_volume_litre',
          'vinaturel_wine_volume',
          'vinaturel_default_volume',
          'volume',
          'inhalt',
          'content'
        ]) ??
        toStringOrNull(payload?.volume) ??
        toStringOrNull(payload?.volumeLabel) ??
        toStringOrNull(payload?.unitName) ??
        toStringOrNull(payload?.unit ?? payload?.packUnit ?? payload?.packUnitName ?? payload?.content) ??
        toStringOrNull(variant?.volume) ??
        toStringOrNull(variant?.content) ??
        toStringOrNull(variant?.unitName) ??
        toStringOrNull(productPayload?.volume) ??
        toStringOrNull(productPayload?.content) ??
        toStringOrNull(parentProductPayload?.volume) ??
        toStringOrNull(parentProductPayload?.content);
      if (!volume) {
        const option = findPayloadOptionByGroup(['volumen', 'volume', 'füllmenge', 'inhalt']);
        if (option) {
          volume = toStringOrNull(option?.name ?? option?.translated?.name ?? option?.value ?? option?.label ?? option?.content) ?? null;
        }
      }
      volume = normaliseVolumeValue(volume);

      return {
        id: toStringOrNull(item?.id) ?? `${order?.id ?? 'order'}-item-${index}`,
        label: toStringOrNull(item?.label) ?? toStringOrNull(payload?.label ?? payload?.name) ?? 'Position',
        quantity,
        unitPrice,
        totalPrice,
        productId: toStringOrNull(item?.productId ?? payload?.productId),
        productNumber: toStringOrNull(payload?.productNumber ?? payload?.number),
        manufacturer,
        vintage,
        volume,
        taxRate
      } satisfies CustomerOrderItem;
    });
  }

  const orderDate =
    toStringOrNull(order?.orderDateTime) ||
    toStringOrNull(order?.orderDate) ||
    toStringOrNull(order?.createdAt);

  const totalAmount = toNumber(order?.amountTotal ?? order?.price?.totalPrice);
  const netAmount = toNumber(order?.amountNet ?? order?.price?.netPrice);
  const taxAmount =
    totalAmount != null && netAmount != null
      ? totalAmount - netAmount
      : toNumber(order?.price?.calculatedTaxes?.reduce?.((sum: number, entry: any) => sum + (Number(entry?.tax) || 0), 0));
  const shippingTotal = toNumber(order?.shippingCosts?.totalPrice ?? order?.shippingCosts?.unitPrice);
  const status =
    toStringOrNull(order?.stateMachineState?.translated?.name) ||
    toStringOrNull(order?.stateMachineState?.name) ||
    toStringOrNull(order?.stateMachineState?.technicalName);

  return {
    id: toStringOrNull(order?.id) ?? randomUUID(),
    orderNumber: toStringOrNull(order?.orderNumber),
    orderDate,
    currency: currencyCode,
    totalAmount,
    netAmount,
    taxAmount,
    shippingTotal,
    status,
    lineItemCount: lineItems.length,
    lineItems
  } satisfies CustomerOrderSummary;
}

async function fetchRecentOrdersForCustomers(customerIds: string[], limit: number) {
  if (customerIds.length === 0 || limit <= 0) {
    return [] as Record<string, any>[];
  }

  const chunkSize = 25;
  const ordersPerChunk = Math.max(limit * 2, 20);
  const aggregatedOrders: Record<string, any>[] = [];

  for (let i = 0; i < customerIds.length; i += chunkSize) {
    const chunk = customerIds.slice(i, i + chunkSize);
    if (chunk.length === 0) {
      continue;
    }

    const payload = {
      filter: [
        {
          type: 'equalsAny',
          field: 'orderCustomer.customerId',
          value: chunk.join('|')
        }
      ],
      sort: [
        {
          field: 'orderDateTime',
          order: 'DESC'
        }
      ],
      limit: ordersPerChunk,
      associations: {
        orderCustomer: {
          associations: {
            customer: {}
          }
        },
        currency: {},
        stateMachineState: {}
      }
    };

    try {
      const response = await adminSearch<any>('/search/order', payload);
      if (Array.isArray(response?.data)) {
        for (const entry of response.data) {
          if (entry?.order) {
            const order = entry.order;
            if (!order.orderCustomer && entry?.orderCustomer) {
              order.orderCustomer = entry.orderCustomer;
            }
            if (!order.orderCustomerId && order?.orderCustomer?.id) {
              order.orderCustomerId = order.orderCustomer.id;
            }
            aggregatedOrders.push(order);
          } else {
            if (entry?.order_customer && !entry.orderCustomer) {
              entry.orderCustomer = entry.order_customer;
            }
            if (!entry?.orderCustomerId && entry?.orderCustomer?.id) {
              entry.orderCustomerId = entry.orderCustomer.id;
            }
            aggregatedOrders.push(entry);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to fetch dashboard orders chunk', {
        chunkSize: chunk.length,
        error: error instanceof Error ? error.message : error
      });
    }
  }

  const orderMap = new Map<string, Record<string, any>>();
  for (const order of aggregatedOrders) {
    const orderId = toStringOrNull(order?.id);
    if (!orderId) {
      continue;
    }

    const orderCustomer = order?.orderCustomer ?? {};
    if (!order?.orderCustomerId && orderCustomer?.id) {
      order.orderCustomerId = orderCustomer.id;
    }
    if (!orderCustomer.customerId) {
      orderCustomer.customerId = order?.orderCustomer?.customer?.id ?? null;
    }

    const existing = orderMap.get(orderId);
    if (!existing) {
      orderMap.set(orderId, order);
      continue;
    }

    const existingDate = new Date(
      toStringOrNull(existing?.orderDateTime) ?? toStringOrNull(existing?.createdAt) ?? '1970-01-01'
    ).getTime();
    const candidateDate = new Date(
      toStringOrNull(order?.orderDateTime) ?? toStringOrNull(order?.createdAt) ?? '1970-01-01'
    ).getTime();

    if (candidateDate > existingDate) {
      orderMap.set(orderId, order);
    }
  }

  const deduplicatedOrders = Array.from(orderMap.values()).sort((a, b) => {
    const timeB = new Date(
      toStringOrNull(b?.orderDateTime) ?? toStringOrNull(b?.createdAt) ?? '1970-01-01'
    ).getTime();
    const timeA = new Date(
      toStringOrNull(a?.orderDateTime) ?? toStringOrNull(a?.createdAt) ?? '1970-01-01'
    ).getTime();
    return timeB - timeA;
  });

  return deduplicatedOrders.slice(0, limit);
}

async function hydrateOrdersWithCustomers(orders: Record<string, any>[]) {
  const missingIds = orders
    .filter((order) => !orderCustomerHasData(order))
    .map((order) => toStringOrNull(order?.orderCustomerId))
    .filter((id): id is string => Boolean(id));

  const uniqueMissingIds = Array.from(new Set(missingIds));
  if (uniqueMissingIds.length === 0) {
    return;
  }

  const chunkSize = 25;
  for (let i = 0; i < uniqueMissingIds.length; i += chunkSize) {
    const chunk = uniqueMissingIds.slice(i, i + chunkSize);
    if (chunk.length === 0) {
      continue;
    }

    const payload = {
      filter: [
        {
          type: 'equalsAny',
          field: 'id',
          value: chunk.join('|')
        }
      ],
      limit: chunk.length,
      includes: {
        order_customer: [
          'id',
          'customerId',
          'customerNumber',
          'email',
          'firstName',
          'lastName',
          'company'
        ],
        customer: [
          'id',
          'firstName',
          'lastName',
          'company',
          'email',
          'customerNumber'
        ]
      },
      associations: {
        orderCustomer: {
          associations: {
            customer: {}
          }
        }
      }
    };

    try {
      const response = await adminSearch<any>('/search/order-customer', payload);
      for (const item of response?.data ?? []) {
        const id = toStringOrNull(item?.id);
        if (!id) continue;

        const target = orders.find((order) => toStringOrNull(order?.orderCustomerId) === id);
        if (!target) continue;

        target.orderCustomer = item;
        if (!target.orderCustomerId && item?.id) {
          target.orderCustomerId = String(item.id);
        }
        if (!target.customerId) {
          target.customerId = toStringOrNull(item?.customerId ?? item?.customer?.id) ?? null;
        }
      }
    } catch (error) {
      console.warn('Failed to hydrate orders with customer data', {
        chunkSize: chunk.length,
        error: error instanceof Error ? error.message : error
      });
    }
  }
}

function orderCustomerHasData(order: Record<string, any> | undefined): boolean {
  if (!order) return false;
  const oc = order.orderCustomer ?? order.order_customer;
  if (!oc) return false;
  if (oc.customerId || oc.customer?.id || oc.customerNumber || oc.email || oc.firstName || oc.company) {
    return true;
  }
  return false;
}

type CustomerLookupMaps = {
  byId: Map<string, MapCustomer>;
  byNumber: Map<string, MapCustomer>;
  byEmail: Map<string, MapCustomer>;
};

function mapDashboardOrder(
  order: Record<string, any>,
  lookup: CustomerLookupMaps
): DashboardOrderSummary {
  const orderCustomer = order?.orderCustomer ?? order?.order_customer ?? {};
  const orderCustomerEntity = orderCustomer?.customer ?? order?.customer ?? {};
  const directCustomerId =
    toStringOrNull(orderCustomer?.customerId) ||
    toStringOrNull(orderCustomerEntity?.id) ||
    toStringOrNull(order?.customerId) ||
    null;

  let customerRecord: MapCustomer | null = null;

  if (directCustomerId) {
    customerRecord = lookup.byId.get(directCustomerId) ?? null;
  }

  if (!customerRecord) {
    const number = toStringOrNull(orderCustomer?.customerNumber);
    if (number) {
      customerRecord = lookup.byNumber.get(number.toLowerCase()) ?? null;
    }
  }

  if (!customerRecord) {
    const email =
      toStringOrNull(orderCustomer?.email) ||
      toStringOrNull(orderCustomerEntity?.email);
    if (email) {
      customerRecord = lookup.byEmail.get(email.toLowerCase()) ?? null;
    }
  }

  const currencyCode =
    toStringOrNull(order?.currency?.isoCode) ||
    toStringOrNull(order?.currency?.shortName) ||
    toStringOrNull(order?.currency?.symbol);

  const totalAmount = toNumber(order?.amountTotal ?? order?.price?.totalPrice);
  const orderDate =
    toStringOrNull(order?.orderDateTime) ||
    toStringOrNull(order?.createdAt) ||
    null;

  const status =
    toStringOrNull(order?.stateMachineState?.translated?.name) ||
    toStringOrNull(order?.stateMachineState?.name) ||
    toStringOrNull(order?.stateMachineState?.technicalName);

  const orderCompany = toStringOrNull(orderCustomer?.company);
  const orderFirstName = toStringOrNull(orderCustomer?.firstName);
  const orderLastName = toStringOrNull(orderCustomer?.lastName);
  const fallbackFirstName = toStringOrNull(orderCustomerEntity?.firstName);
  const fallbackLastName = toStringOrNull(orderCustomerEntity?.lastName);
  const fallbackCompany = toStringOrNull(orderCustomerEntity?.company);
  const entityCompany = toStringOrNull(orderCustomerEntity?.company);
  const entityFirstName = toStringOrNull(orderCustomerEntity?.firstName);
  const entityLastName = toStringOrNull(orderCustomerEntity?.lastName);
  const orderFullName = [orderFirstName, orderLastName].filter(Boolean).join(' ').trim() || null;
  const fallbackFullName = [fallbackFirstName, fallbackLastName].filter(Boolean).join(' ').trim() || null;
  const entityFullName = [entityFirstName, entityLastName].filter(Boolean).join(' ').trim() || null;
  const customerNameFromOrder =
    orderCompany ||
    fallbackCompany ||
    entityCompany ||
    orderFullName ||
    fallbackFullName ||
    entityFullName ||
    toStringOrNull(orderCustomer?.email) ||
    toStringOrNull(orderCustomer?.customer?.email) ||
    toStringOrNull(orderCustomerEntity?.email);

  const customerNumber =
    customerRecord?.customerNumber ??
    toStringOrNull(orderCustomer?.customerNumber) ??
    toStringOrNull(orderCustomerEntity?.customerNumber);

  const customerCompany =
    customerRecord?.company ??
    orderCompany ??
    fallbackCompany ??
    entityCompany ??
    null;

  const resolvedCustomerId = customerRecord?.id ?? directCustomerId ?? null;
  const displayName = customerRecord?.name ?? customerNameFromOrder ?? 'Unbekannter Kunde';

  if (displayName === 'Unbekannter Kunde') {
    console.warn('Dashboard order missing customer display name', {
      orderId: toStringOrNull(order?.id),
      directCustomerId,
      resolvedCustomerId,
      orderCustomer,
      orderCustomerEntity,
      lookedUpCustomer: customerRecord?.id ?? null
    });
  }

  if (!customerRecord) {
    console.warn('Dashboard order has no CRM mapping', {
      orderId: toStringOrNull(order?.id),
      directCustomerId,
      orderCustomer,
      matchedByNumber: orderCustomer?.customerNumber ?? null,
      matchedByEmail: orderCustomer?.email ?? orderCustomer?.customer?.email ?? null
    });
  }

  return {
    id: toStringOrNull(order?.id) ?? randomUUID(),
    orderNumber: toStringOrNull(order?.orderNumber),
    orderDate,
    currency: currencyCode,
    totalAmount,
    status,
    customerId: resolvedCustomerId,
    customerName: displayName,
    customerCompany,
    customerNumber: customerNumber ?? null
  } satisfies DashboardOrderSummary;
}

export async function registerRoutes(app: Express): Promise<{ httpServer: ReturnType<typeof createServer>; io: CustomSocketIOServer }> {
  // CORS wird bereits in index.ts konfiguriert
  
  // Parse JSON bodies
  app.use(json());
  
  // Enable pre-flight for all routes
  app.options('*', (req, res) => {
    res.status(200).end();
  });

  // Define interfaces for better type safety
  interface LoginRequest {
    email: string;
    password: string;
  }
  
  interface LoginResponseData {
    success: boolean;
    token?: string;
    user?: {
      id: string;
      email: string;
      firstName?: string | null;
      lastName?: string | null;
      customerNumber?: string | null;
      role: string;
      salesRepEmail?: string | null;
      salesRepId?: string | null;
      profileImageUrl?: string | null;
      contextToken?: string;
    };
    message?: string;
    code?: string;
    errorId?: string;
    timestamp?: string;
  }

  // Login handler for both endpoints
  const handleLogin = async (req: Request<{}, {}, LoginRequest>, res: Response<LoginResponseData>) => {
    console.log('Login request received:', { 
      headers: req.headers,
      body: { ...req.body, password: req.body.password ? '***' : undefined },
      ip: req.ip,
      method: req.method,
      url: req.originalUrl,
      timestamp: new Date().toISOString()
    });
    
    try {
      const { email, password } = req.body;
      
      // Validate request body
      if (!email || !password) {
        console.log('Missing email or password');
        const errorResponse: LoginResponseData = { 
          success: false, 
          message: 'E-Mail und Passwort werden benötigt',
          code: 'MISSING_CREDENTIALS',
          timestamp: new Date().toISOString()
        };
        return res.status(400).json(errorResponse);
      }

      console.log('Looking up CRM user in database...');
      const crmUser = await findUserByEmail(email);

      if (!crmUser) {
        console.log('CRM user not found', { email });
        return res.status(401).json({
          success: false,
          message: 'Ungültige Anmeldedaten. Bitte überprüfen Sie E-Mail und Passwort.',
          code: 'INVALID_CREDENTIALS',
          timestamp: new Date().toISOString()
        });
      }

      const passwordValid = await verifyPassword(crmUser.passwordHash, password);

      if (!passwordValid) {
        console.log('Password verification failed for CRM user', { userId: crmUser.id });
        return res.status(401).json({
          success: false,
          message: 'Ungültige Anmeldedaten. Bitte überprüfen Sie E-Mail und Passwort.',
          code: 'INVALID_CREDENTIALS',
          timestamp: new Date().toISOString()
        });
      }

      const salesRepEmail = (crmUser.salesRepEmail ?? crmUser.email)?.toLowerCase();

      console.log('Generating JWT token...');
      let token;
      try {
        const tokenData = {
          id: crmUser.id,
          email: crmUser.email,
          role: crmUser.role ?? 'sales_rep',
          firstName: crmUser.firstName ?? null,
          lastName: crmUser.lastName ?? null,
          customerNumber: null,
          salesRepEmail,
          salesRepId: crmUser.salesRepId ?? null
        };

        console.log('Creating JWT token with data:', {
          ...tokenData,
          salesRepEmail: tokenData.salesRepEmail,
          salesRepId: tokenData.salesRepId
        });

        token = generateToken(tokenData);

        console.log('JWT token generated successfully', {
          userId: crmUser.id,
          tokenLength: token?.length || 0,
          timestamp: new Date().toISOString()
        });
      } catch (tokenError: any) {
        console.error('Error generating JWT token:', {
          message: tokenError.message,
          stack: tokenError.stack,
          timestamp: new Date().toISOString()
        });
        
        return res.status(500).json({
          success: false,
          message: 'Interner Serverfehler. Bitte versuchen Sie es später erneut.',
          code: 'TOKEN_GENERATION_ERROR',
          timestamp: new Date().toISOString()
        });
      }

      console.log('Login successful, preparing response', {
        userId: crmUser.id,
        email: crmUser.email,
        timestamp: new Date().toISOString()
      });
      
      // Prepare user data for response
      const userData = {
        id: crmUser.id,
        email: crmUser.email,
        firstName: crmUser.firstName ?? null,
        lastName: crmUser.lastName ?? null,
        customerNumber: null,
        role: crmUser.role ?? 'sales_rep',
        salesRepEmail,
        salesRepId: crmUser.salesRepId ?? null,
        profileImageUrl: crmUser.profileImageUrl ?? null,
        contextToken: undefined
      };
      
      // Log the response (without sensitive data)
      console.log('Sending login response', {
        success: true,
        user: userData,
        token: token ? '***JWT_TOKEN***' : 'MISSING',
        timestamp: new Date().toISOString()
      });
      
      // Set response headers
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
      
      // Return token and user data
      return res.status(200).json({
        success: true,
        token,
        user: userData
      });
      
    } catch (error: any) {
      const timestamp = new Date().toISOString();
      const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
      // Log the full error with request details
      console.error('Unexpected login error:', {
        errorId,
        timestamp,
        message: error.message,
        name: error.name,
        code: error.code,
        status: error.status,
        statusCode: error.statusCode,
        response: error.response,
        request: {
          method: req.method,
          url: req.originalUrl,
          headers: req.headers,
          body: { 
            ...req.body, 
            password: req.body.password ? '***REDACTED***' : undefined 
          },
          query: req.query,
          params: req.params,
          ip: req.ip,
          ips: req.ips,
          hostname: req.hostname,
          protocol: req.protocol,
          secure: req.secure,
          subdomains: req.subdomains
        },
        stack: error.stack
      });
      
      // Determine status code
      let statusCode = 500;
      if (error.status && typeof error.status === 'number') {
        statusCode = error.status;
      } else if (error.statusCode && typeof error.statusCode === 'number') {
        statusCode = error.statusCode;
      } else if (error.response?.status) {
        statusCode = error.response.status;
      }
      
      // Determine error message
      let errorMessage = 'Ein unerwarteter Fehler ist aufgetreten';
      if (error.message) {
        errorMessage = error.message;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.errors?.[0]?.detail) {
        errorMessage = error.response.data.errors[0].detail;
      }
      
      // Determine error code
      let errorCode = 'UNKNOWN_ERROR';
      if (error.code) {
        errorCode = error.code;
      } else if (error.response?.data?.code) {
        errorCode = error.response.data.code;
      } else if (error.response?.data?.errors?.[0]?.code) {
        errorCode = error.response.data.errors[0].code;
      }
      
      // Send error response
      return res.status(statusCode).json({
        success: false,
        message: errorMessage,
        code: errorCode,
        errorId,
        timestamp
      });
    }
  };
  
  // Register both login routes for backward compatibility
  app.post('/api/login', handleLogin);
  app.post('/store-api/account/login', handleLogin);

  app.get('/api/microsoft/status', auth, async (req: AuthRequest, res: Response) => {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'Nicht autorisiert' });
    }

    if (!isMicrosoftGraphConfigured()) {
      return res.json({ success: false, configured: false, connected: false });
    }

    const credential = await prisma.microsoftCredential.findUnique({ where: { crmUserId: req.user.id } });

    return res.json({
      success: true,
      configured: true,
      connected: Boolean(credential),
      expiresAt: credential?.expiresAt ?? null
    });
  });

  app.get('/api/microsoft/oauth-url', auth, async (req: AuthRequest, res: Response) => {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'Nicht autorisiert' });
    }

    if (!isMicrosoftGraphConfigured()) {
      return res.status(503).json({ success: false, message: 'Microsoft OAuth ist nicht konfiguriert' });
    }

    const statePayload = JSON.stringify({
      userId: req.user.id,
      nonce: randomUUID(),
      timestamp: Date.now()
    });

    const state = Buffer.from(statePayload).toString('base64url');

    req.session.microsoftOAuth = {
      state,
      userId: req.user.id,
      createdAt: Date.now()
    };

    const authUrl = buildMicrosoftAuthUrl(state);

    return res.json({ success: true, url: authUrl });
  });

  app.get('/auth/microsoft/callback', async (req: Request, res: Response) => {
    const { code, state, error, error_description: errorDescription } = req.query as Record<string, string | undefined>;

    if (error) {
      console.error('Microsoft OAuth error', { error, errorDescription });
      return res.redirect('/dashboard?calendar=error');
    }

    if (!code || !state) {
      console.warn('Microsoft OAuth callback missing code or state');
      return res.redirect('/dashboard?calendar=error');
    }

    const oAuthSession = req.session.microsoftOAuth;

    const maxAgeMs = 10 * 60 * 1000;
    const isExpired = oAuthSession && Date.now() - oAuthSession.createdAt > maxAgeMs;

    if (!oAuthSession || oAuthSession.state !== state || isExpired) {
      console.warn('Microsoft OAuth state mismatch or session expired');
      return res.redirect('/dashboard?calendar=expired');
    }

    const userId = oAuthSession.userId;

    try {
      const tokenSet = await exchangeCodeForToken(code);
      await storeTokenSet(userId, tokenSet);
      delete req.session.microsoftOAuth;
      return res.redirect('/dashboard?calendar=connected');
    } catch (err) {
      console.error('Failed to store Microsoft OAuth tokens', err);
      return res.redirect('/dashboard?calendar=error');
    }
  });

  app.get('/api/calendar/events', auth, async (req: AuthRequest, res: Response) => {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'Nicht autorisiert' });
    }

    if (!isMicrosoftGraphConfigured()) {
      return res.status(200).json({ success: false, configured: false, connected: false, events: [] });
    }

    const credential = await prisma.microsoftCredential.findUnique({ where: { crmUserId: req.user.id } });

    if (!credential) {
      return res.status(200).json({ success: true, configured: true, connected: false, events: [] });
    }

    try {
      const { accessToken } = await getValidAccessToken(req.user.id);
      const events = await fetchUpcomingEvents(accessToken);
      return res.json({ success: true, configured: true, connected: true, events });
    } catch (error: any) {
      if (error?.message === 'UNAUTHORIZED_MICROSOFT_ACCESS') {
        console.warn('Stored Microsoft credentials are no longer valid. Disconnecting account.', {
          userId: req.user.id
        });
        await disconnectMicrosoftAccount(req.user.id);
        return res.status(200).json({ success: true, configured: true, connected: false, events: [] });
      }

      console.error('Failed to load Microsoft calendar events', error);
      return res.status(500).json({ success: false, configured: true, connected: true, message: 'Kalender konnte nicht geladen werden' });
    }
  });

  app.delete('/api/microsoft', auth, async (req: AuthRequest, res: Response) => {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'Nicht autorisiert' });
    }

    await disconnectMicrosoftAccount(req.user.id);
    return res.json({ success: true });
  });

  // Define interfaces for logout
  interface LogoutResponseData {
    success: boolean;
    message?: string;
    code?: string;
    errorId?: string;
    timestamp?: string;
  }

  // Logout route
  app.post('/api/auth/logout', auth, async (req: AuthRequest, res: Response<LogoutResponseData>) => {
    const timestamp = new Date().toISOString();
    const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    console.log('Logout request received', {
      userId: req.user?.id,
      timestamp,
      headers: req.headers,
      ip: req.ip
    });
    
    try {
      // Clear any client-side tokens
      res.setHeader('Clear-Site-Data', '"cookies", "storage"');
      
      console.log('Logout successful', {
        userId: req.user?.id,
        timestamp
      });
      
      return res.status(200).json({ 
        success: true, 
        message: 'Erfolgreich abgemeldet',
        timestamp
      });
      
    } catch (error: any) {
      console.error('Logout error:', {
        errorId,
        message: error.message,
        stack: error.stack,
        userId: req.user?.id,
        timestamp
      });
      
      // Even if logout fails, we still want to clear the client-side session
      res.setHeader('Clear-Site-Data', '"cookies", "storage"');
      
      return res.status(500).json({ 
        success: false, 
        message: 'Fehler beim Abmelden. Ihre Sitzung wurde lokal gelöscht, aber möglicherweise nicht auf dem Server.',
        code: 'LOGOUT_ERROR',
        errorId,
        timestamp
      });
    }
  });

  // Define interfaces for /me endpoint
  interface MeResponseData {
    success: boolean;
    user?: {
      id: string;
      email: string;
      firstName?: string | null;
      lastName?: string | null;
      customerNumber?: string | null;
      role: string;
      salesRepEmail?: string | null;
      salesRepId?: string | null;
      profileImageUrl?: string | null;
    };
    message?: string;
    code?: string;
    errorId?: string;
    timestamp?: string;
  }

  app.get(
    '/admin-api/catalog',
    auth,
    async (req: AuthRequest, res: Response<CatalogListResponse | { error: string }>) => {
    try {
      const searchTerm = extractQueryParam(req.query.search);
      const articleNumber = extractQueryParam(req.query.articleNumber);
      const manufacturerId = extractQueryParam(req.query.manufacturerId);
      const limitParam = extractQueryParam(req.query.limit);
      const parsedLimit = Number.parseInt(limitParam ?? '150', 10);
      const limit = Number.isFinite(parsedLimit)
        ? Math.min(Math.max(parsedLimit, 1), 250)
        : 150;

      const filters: Array<Record<string, unknown>> = [];
      if (articleNumber) {
        filters.push({
          type: 'contains',
          field: 'productNumber',
          value: articleNumber,
        });
      }
      if (manufacturerId) {
        filters.push({
          type: 'equals',
          field: 'manufacturerId',
          value: manufacturerId,
        });
      }

      const payload: Record<string, unknown> = {
        limit,
        associations: {
          manufacturer: {},
          properties: {
            associations: {
              group: {},
            },
          },
          translations: {},
          prices: {
            associations: {
              rule: {},
            },
          },
          cover: {
            associations: {
              media: {},
            },
          },
          media: {
            limit: 20,
            associations: {
              media: {},
            },
          },
        },
        'total-count-mode': 1,
        includes: {
          product: [
            'id',
            'productNumber',
            'stock',
            'availableStock',
            'manufacturerId',
            'manufacturer',
            'properties',
            'customFields',
            'price',
            'translated',
            'coverId',
            'cover',
            'media',
          ],
          product_media: ['id', 'mediaId', 'position', 'media'],
          product_translation: ['name', 'description', 'customFields'],
          product_manufacturer: ['id', 'name'],
          property_group_option: ['id', 'name', 'customFields', 'group'],
          property_group: ['id', 'name', 'customFields'],
          media: ['id', 'url'],
        },
      };

      if (filters.length > 0) {
        payload.filter = filters;
      }

      if (searchTerm) {
        payload.search = searchTerm;
      }

      const response = await adminSearch<any>('/search/product', payload);
      const products: Record<string, any>[] = response?.data ?? [];

      const items: CatalogSummaryItem[] = [];
      const manufacturerMap = new Map<string, string | null>();
      const vintageSet = new Set<string>();

      for (const product of products) {
        const productNumber = toStringOrNull(product?.productNumber);
        if (productNumber?.toUpperCase().startsWith('VARIANTEN_')) {
          continue;
        }

        const summary = mapProductToCatalogSummary(product);
        items.push(summary);

        const manufacturerIdentifier = toStringOrNull(product?.manufacturerId);
        if (manufacturerIdentifier) {
          const name = summary.winery ?? toStringOrNull(product?.manufacturer?.name) ?? null;
          if (!manufacturerMap.has(manufacturerIdentifier)) {
            manufacturerMap.set(manufacturerIdentifier, name);
          }
        }

        if (summary.vintage) {
          vintageSet.add(summary.vintage);
        }
      }

      const facets = {
        wineries: Array.from(manufacturerMap.entries()).map(([id, name]) => ({ id, name })),
        vintages: Array.from(vintageSet).sort((a, b) => b.localeCompare(a, 'de')),
      };

      const payloadResponse: CatalogListResponse = {
        items,
        facets,
      };

      return res.json(payloadResponse);
    } catch (error) {
      console.error('Failed to fetch catalog', {
        error: error instanceof Error ? error.message : error,
      });
      return res.status(500).json({ error: 'Sortiment konnte nicht geladen werden.' });
    }
  });

  app.get(
    '/admin-api/catalog/:id',
    auth,
    async (req: AuthRequest, res: Response<CatalogDetailResponse | { error: string }>) => {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Artikel-ID fehlt.' });
    }

    try {
      const productResponse = await adminSearch<any>('/search/product', {
        filter: [
          {
            type: 'equals',
            field: 'id',
            value: id,
          },
        ],
        limit: 1,
        associations: {
          manufacturer: {},
          properties: {
            associations: {
              group: {},
            },
          },
          translations: {},
          prices: {
            associations: {
              rule: {},
            },
          },
          cover: {
            associations: {
              media: {},
            },
          },
          media: {
            limit: 20,
            associations: {
              media: {},
            },
          },
        },
        includes: {
          product: [
            'id',
            'productNumber',
            'stock',
            'availableStock',
            'manufacturerId',
            'manufacturer',
            'properties',
            'customFields',
            'price',
            'translated',
            'coverId',
            'cover',
            'media',
          ],
          product_media: ['id', 'mediaId', 'position', 'media'],
          product_translation: ['name', 'description', 'customFields'],
          product_manufacturer: ['id', 'name'],
          property_group_option: ['id', 'name', 'customFields', 'group'],
          property_group: ['id', 'name', 'customFields'],
          media: ['id', 'url'],
        },
      });

      const product = productResponse?.data?.[0];
      if (!product) {
        return res.status(404).json({ error: 'Artikel wurde nicht gefunden.' });
      }

      const productNumber = toStringOrNull(product?.productNumber);
      if (productNumber?.toUpperCase().startsWith('VARIANTEN_')) {
        return res.status(404).json({ error: 'Artikel wurde nicht gefunden.' });
      }

      const currentStock = toNumber(product?.stock);
      const assignedIndex = await buildAssignedCustomerIndex(req.user ?? {});
      const orderLineItems = await fetchOrderLineItemsForProduct(id, {
        salesRepId: req.user?.salesRepId ?? null,
      });
      const topCustomers = buildTopCustomersFromLineItems(orderLineItems, {
        assignedIndex,
        restrictToAssignments: Boolean(req.user?.salesRepId || req.user?.salesRepEmail),
      });
      const salesInsights = calculateMonthlySalesInsights(orderLineItems, currentStock);
      const stockHistory = await fetchStockHistoryForProduct(id, currentStock);
      const detailItem = mapProductToCatalogDetail(product, topCustomers, stockHistory, salesInsights);

      const detailResponse: CatalogDetailResponse = {
        item: detailItem,
      };

      return res.json(detailResponse);
    } catch (error) {
      console.error('Failed to fetch catalog item', {
        productId: id,
        error: error instanceof Error ? error.message : error,
      });
      return res.status(500).json({ error: 'Artikel konnte nicht geladen werden.' });
    }
  });

  app.get(
    '/admin-api/linther-liste',
    auth,
    async (req: AuthRequest, res: Response<LintherListeResponse | { error: string }>) => {
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Nicht autorisiert' });
      }

      try {
        const { accessToken } = await getValidAccessToken(req.user.id);
        const data = await getLintherListe(accessToken);
        return res.json(data);
      } catch (error) {
        if (error instanceof GraphApiError) {
          console.error('Failed to load Linther Liste', {
            status: error.statusCode,
            code: error.code,
            message: error.message
          });

          if (error.isAuthError) {
            return res.status(403).json({
              error: 'Microsoft-Berechtigungen sind abgelaufen oder unzureichend. Bitte Microsoft-Konto erneut verbinden.'
            });
          }

          const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500;
          return res.status(status).json({ error: 'Linther Liste konnte nicht geladen werden.' });
        }

        console.error('Failed to load Linther Liste', {
          error: error instanceof Error ? error.message : error
        });
        return res.status(500).json({ error: 'Linther Liste konnte nicht geladen werden.' });
      }
    }
  );

  app.get('/admin-api/analytics/summary', auth, async (req: AuthRequest, res) => {
    const timestamp = new Date().toISOString();
    const errorId = `analytics_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    try {
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: 'Nicht autorisiert',
          code: 'UNAUTHORIZED',
          errorId,
          timestamp
        });
      }

      const crmUser = await prisma.crmUser.findUnique({ where: { id: req.user.id } });

      if (!crmUser) {
        return res.status(404).json({
          success: false,
          message: 'Benutzer wurde nicht gefunden',
          code: 'USER_NOT_FOUND',
          errorId,
          timestamp
        });
      }

      const normalizedEmail = crmUser.salesRepEmail?.toLowerCase() ?? null;

      const period = resolveAnalyticsPeriod(extractQueryParam(req.query?.period));
      const group = resolveAnalyticsCustomerGroup(extractQueryParam(req.query?.group));
      const fromParam = extractQueryParam(req.query?.from);
      const toParam = extractQueryParam(req.query?.to);

      const ranges = resolveAnalyticsRanges(period, { from: fromParam, to: toParam });

      const { customers: assignedCustomers, hadAssignment } = await loadAssignedCustomers(
        {
          id: crmUser.id,
          email: crmUser.email,
          salesRepEmail: crmUser.salesRepEmail,
          salesRepId: crmUser.salesRepId,
          role: crmUser.role,
        },
        normalizedEmail,
        { timestamp }
      );

      if (!hadAssignment || assignedCustomers.length === 0) {
        const fallbackResponse: AnalyticsSummaryResponse = {
          period: {
            type: period,
            current: {
              from: ranges.current.from.toISOString(),
              to: ranges.current.to.toISOString()
            },
            previous: {
              from: ranges.previous.from.toISOString(),
              to: ranges.previous.to.toISOString()
            }
          },
          filters: {
            group
          },
          totals: {
            revenue: {
              currency: 'EUR',
              current: 0,
              previous: 0
            },
            orders: {
              current: 0,
              previous: 0
            }
          },
          trend: [],
          topCustomers: [],
          orders: [],
          currency: 'EUR',
          meta: {
            assignedCustomerCount: assignedCustomers.length,
            filteredCustomerCount: 0
          }
        };

        return res.json(fallbackResponse);
      }

      const filteredCustomers = assignedCustomers.filter((customer) => matchesAnalyticsCustomerGroup(customer, group));

      const customerIndex = new Map<string, CustomerIdentifier>();
      const shopwareIdIndex = new Map<string, string>();
      const customerNumberIndex = new Map<string, string>();
      const customerEmailIndex = new Map<string, string>();
      for (const customer of filteredCustomers) {
        const id = toStringOrNull(customer.id);
        if (!id) continue;

        const baseName = toStringOrNull((customer as any).name ?? null);
        const fallbackName = [
          toStringOrNull(customer.firstName ?? null),
          toStringOrNull(customer.lastName ?? null)
        ]
          .filter(Boolean)
          .join(' ')
          .trim();

        const shopwareId = toStringOrNull((customer as any).shopwareCustomerId ?? null) ?? id;

        customerIndex.set(id, {
          id,
          shopwareId,
          customerNumber: toStringOrNull(customer.customerNumber),
          email: toStringOrNull(customer.email)?.toLowerCase() ?? null,
          displayName: baseName || (fallbackName.length > 0 ? fallbackName : null),
          company: toStringOrNull(customer.company)
        });

        if (shopwareId && shopwareId !== id && !customerIndex.has(shopwareId)) {
          customerIndex.set(shopwareId, {
            id,
            shopwareId,
            customerNumber: toStringOrNull(customer.customerNumber),
            email: toStringOrNull(customer.email)?.toLowerCase() ?? null,
            displayName: baseName || (fallbackName.length > 0 ? fallbackName : null),
            company: toStringOrNull(customer.company)
          });
        }

        if (shopwareId && !shopwareIdIndex.has(shopwareId)) {
          shopwareIdIndex.set(shopwareId, id);
        }

        const numberKey = toStringOrNull(customer.customerNumber);
        if (numberKey && !customerNumberIndex.has(numberKey)) {
          customerNumberIndex.set(numberKey, id);
        }

        const emailKey = toStringOrNull(customer.email)?.toLowerCase() ?? null;
        if (emailKey && !customerEmailIndex.has(emailKey)) {
          customerEmailIndex.set(emailKey, id);
        }
      }

      const customerIds = filteredCustomers
        .map((customer) =>
          toStringOrNull((customer as any).shopwareCustomerId ?? null) ?? toStringOrNull(customer.id)
        )
        .filter((value): value is string => Boolean(value));

      const indexBundle: CustomerIndexBundle = {
        customerIndex,
        shopwareIndex: shopwareIdIndex,
        numberIndex: customerNumberIndex,
        emailIndex: customerEmailIndex
      };

      const currentMetrics = await aggregateOrdersForAnalytics(customerIds, ranges.current, indexBundle);
      const previousMetrics = await aggregateOrdersForAnalytics(customerIds, ranges.previous, indexBundle);

      const currency = currentMetrics.currency ?? previousMetrics.currency ?? 'EUR';

      const customerNameLookup = new Map<string, string>();
      for (const customer of filteredCustomers) {
        if (customer.id) {
          const baseName = toStringOrNull((customer as any).name ?? null);
          const fallbackName = [
            toStringOrNull(customer.firstName ?? null),
            toStringOrNull(customer.lastName ?? null)
          ]
            .filter(Boolean)
            .join(' ')
            .trim();

          const label =
            toStringOrNull(customer.company ?? null) ||
            baseName ||
            (fallbackName.length > 0 ? fallbackName : null) ||
          toStringOrNull(customer.email ?? null) ||
          toStringOrNull(customer.customerNumber ?? null) ||
          customer.id;

          customerNameLookup.set(customer.id, label);
          const shopwareId = toStringOrNull((customer as any).shopwareCustomerId ?? null);
          if (shopwareId && !customerNameLookup.has(shopwareId)) {
            customerNameLookup.set(shopwareId, label);
          }
        }
      }

      const chartRangeEnd = endOfDay(endOfMonth(ranges.current.to));
      const chartRangeStart = startOfDay(startOfMonth(subMonths(chartRangeEnd, 11)));

      const previousChartRangeEnd = endOfDay(endOfMonth(subYears(chartRangeEnd, 1)));
      const previousChartRangeStart = startOfDay(subYears(chartRangeStart, 1));

      const trendCurrentResult = await fetchOrdersWithinRange(customerIds, {
        from: chartRangeStart,
        to: chartRangeEnd
      }, indexBundle);
      const trendPreviousResult = await fetchOrdersWithinRange(customerIds, {
        from: previousChartRangeStart,
        to: previousChartRangeEnd
      }, indexBundle);

      const ordersByMonth = new Map<string, number>();
      for (const entry of trendCurrentResult.orders) {
        if (!entry.orderDate || !Number.isFinite(entry.amount)) continue;
        const key = format(entry.orderDate, 'yyyy-MM');
        ordersByMonth.set(key, (ordersByMonth.get(key) ?? 0) + entry.amount);
      }

      const previousOrdersByMonth = new Map<string, number>();
      for (const entry of trendPreviousResult.orders) {
        if (!entry.orderDate || !Number.isFinite(entry.amount)) continue;
        const key = format(entry.orderDate, 'yyyy-MM');
        previousOrdersByMonth.set(key, (previousOrdersByMonth.get(key) ?? 0) + entry.amount);
      }

      const monthSequence = eachMonthOfInterval({
        start: chartRangeStart,
        end: chartRangeEnd
      });

      const trend: AnalyticsTrendPoint[] = monthSequence.map((date) => {
        const monthKey = format(date, 'yyyy-MM');
        const previousMonthKey = format(subYears(date, 1), 'yyyy-MM');

        return {
          month: monthKey,
          label: format(date, 'LLL', { locale: de }),
          current: Math.round(ordersByMonth.get(monthKey) ?? 0),
          previous: Math.round(previousOrdersByMonth.get(previousMonthKey) ?? 0)
        } satisfies AnalyticsTrendPoint;
      });

      const revenueByCustomer = new Map<string, {
        customerId: string | null;
        shopwareCustomerId: string | null;
        name: string;
        amount: number;
        number: string | null;
        email: string | null;
        company: string | null;
        orderNumber: string | null;
      }>();

      for (const order of currentMetrics.orders) {
        if (!Number.isFinite(order.amount)) {
          continue;
        }

        const shopwareCustomerId = order.shopwareCustomerId ?? null;
        const crmCustomerId =
          order.customerId ??
          (shopwareCustomerId ? shopwareIdIndex.get(shopwareCustomerId) ?? null : null);

        const aggregationKey =
          crmCustomerId ??
          (shopwareCustomerId ? `shopware_${shopwareCustomerId}` : `__unknown_${order.id}`);

        const name =
          (crmCustomerId ? customerNameLookup.get(crmCustomerId) : null) ||
          order.customerCompany ||
          order.customerName ||
          order.customerNumber ||
          order.customerEmail ||
          'Unbekannter Kunde';

        const record = revenueByCustomer.get(aggregationKey) ?? {
          customerId: crmCustomerId,
          shopwareCustomerId,
          name,
          amount: 0,
          number: order.customerNumber,
          email: order.customerEmail,
          company: order.customerCompany,
          orderNumber: order.orderNumber
        };

        record.amount += order.amount;
        record.name = record.name && record.name !== 'Unbekannter Kunde' ? record.name : name;
        record.number = record.number || order.customerNumber;
        record.email = record.email || order.customerEmail;
        record.company = record.company || order.customerCompany;
        record.orderNumber = record.orderNumber || order.orderNumber;
        record.customerId = record.customerId ?? crmCustomerId;
        record.shopwareCustomerId = record.shopwareCustomerId ?? shopwareCustomerId;
        revenueByCustomer.set(aggregationKey, record);
      }

      const topCustomers = Array.from(revenueByCustomer.values())
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10)
        .map((entry) => {
          const resolvedCustomerId =
            entry.customerId ||
            (entry.shopwareCustomerId ? shopwareIdIndex.get(entry.shopwareCustomerId) ?? null : null) ||
            (entry.number ? customerNumberIndex.get(entry.number) ?? null : null) ||
            (entry.email ? customerEmailIndex.get(entry.email.toLowerCase()) ?? null : null);

          const lookupName = resolvedCustomerId ? customerNameLookup.get(resolvedCustomerId) : null;

          const displayName = entry.name && entry.name !== 'Unbekannter Kunde'
            ? entry.name
            : lookupName ||
              entry.company ||
              entry.number ||
              entry.email ||
              (resolvedCustomerId ? `Kunde ${resolvedCustomerId}` : null) ||
              'Unbekannter Kunde';

          return {
            customerId: resolvedCustomerId,
            shopwareCustomerId: entry.shopwareCustomerId ?? null,
            name: displayName,
            revenue: Math.round(entry.amount),
            orderNumber: entry.orderNumber ?? null
          };
        });

      const orderRows = currentMetrics.orders
        .sort((a, b) => {
          if (!a.orderDate && !b.orderDate) return 0;
          if (!a.orderDate) return 1;
          if (!b.orderDate) return -1;
          return b.orderDate.getTime() - a.orderDate.getTime();
        })
        .slice(0, 100)
        .map((order) => ({
          id: order.id,
          orderNumber: order.orderNumber,
          orderDate: order.orderDate ? order.orderDate.toISOString() : null,
          amount: Number.isFinite(order.amount) ? Number(order.amount) : 0,
          currency: order.currency ?? currency,
          customerId: order.customerId,
          shopwareCustomerId: order.shopwareCustomerId ?? null,
          customerCompany: order.customerCompany,
          customerNumber: order.customerNumber,
          customerEmail: order.customerEmail,
          customerName: order.customerName,
          customerFirstName: order.customerFirstName,
          customerLastName: order.customerLastName,
        }));

      const responsePayload: AnalyticsSummaryResponse = {
        period: {
          type: period,
          current: {
            from: ranges.current.from.toISOString(),
            to: ranges.current.to.toISOString()
          },
          previous: {
            from: ranges.previous.from.toISOString(),
            to: ranges.previous.to.toISOString()
          }
        },
        filters: {
          group
        },
        totals: {
          revenue: {
            currency,
            current: currentMetrics.totalAmount,
            previous: previousMetrics.totalAmount
          },
          orders: {
            current: currentMetrics.orderCount,
            previous: previousMetrics.orderCount
          }
        },
        trend,
        topCustomers,
        orders: orderRows,
        currency,
        meta: {
          assignedCustomerCount: assignedCustomers.length,
          filteredCustomerCount: customerIds.length
        }
      } satisfies AnalyticsSummaryResponse;

      console.log('Analytics summary computed', {
        userId: crmUser.id,
        period,
        group,
        assigned: assignedCustomers.length,
        filtered: customerIds.length,
        totalRevenue: currentMetrics.totalAmount,
        orderCount: currentMetrics.orderCount,
        trendPoints: trend.length,
        topCustomers: topCustomers.map((customer) => ({
          name: customer.name,
          revenue: customer.revenue,
          customerId: customer.customerId,
        })),
        orderCountReturned: orderRows.length,
        unmatchedOrders: currentMetrics.unmatched.slice(0, 5)
      });

      return res.json(responsePayload);
    } catch (error: any) {
      console.error('Failed to build analytics summary', {
        errorId,
        message: error?.message,
        stack: error?.stack,
        userId: req.user?.id,
        timestamp
      });

      return res.status(500).json({
        success: false,
        message: 'Fehler beim Berechnen der Auswertungen',
        code: 'ANALYTICS_SUMMARY_ERROR',
        errorId,
        timestamp
      });
    }
  });

  app.post(
    '/admin-api/linther-liste',
    auth,
    async (req: AuthRequest, res: Response<LintherListeRow | { error: string }>) => {
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Nicht autorisiert' });
      }

      const schema = z.object({
        palNr: z.string().optional(),
        weinbezeichnung: z.string().optional(),
        artikelnr: z.string().optional(),
        bemerkung: z.string().optional(),
        lagerort: z.string().optional()
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Ungültige Eingabe für Linther Liste.' });
      }

      try {
        const { accessToken } = await getValidAccessToken(req.user.id);
        const addedRow = await addLintherListeRow(parsed.data, accessToken);
        return res.status(201).json(addedRow);
      } catch (error) {
        if (error instanceof GraphApiError) {
          console.error('Failed to add row to Linther Liste', {
            status: error.statusCode,
            code: error.code,
            message: error.message
          });

          if (error.isAuthError) {
            return res.status(403).json({
              error: 'Microsoft-Berechtigungen sind abgelaufen oder unzureichend. Bitte Microsoft-Konto erneut verbinden.'
            });
          }

          const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500;
          return res.status(status).json({ error: 'Eintrag konnte nicht hinzugefügt werden.' });
        }

        console.error('Failed to add row to Linther Liste', {
          error: error instanceof Error ? error.message : error
        });
        return res.status(500).json({ error: 'Eintrag konnte nicht hinzugefügt werden.' });
      }
    }
  );

  // Get customers from Shopware
  app.get('/admin-api/search/customer', auth, async (req: AuthRequest, res) => {
    const timestamp = new Date().toISOString();
    const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    console.log('Fetching customers for CRM user', {
      userId: req.user?.id,
      timestamp,
      ip: req.ip
    });

    try {
      if (!req.user?.id) {
        console.warn('Missing authenticated user information for customer lookup', { timestamp });
        return res.status(401).json({
          success: false,
          message: 'Nicht autorisiert',
          code: 'UNAUTHORIZED',
          errorId,
          timestamp
        });
      }

      const crmUser = await prisma.crmUser.findUnique({ where: { id: req.user.id } });

      if (!crmUser) {
        console.warn('CRM user not found for customer lookup', { userId: req.user.id });
        return res.status(404).json({
          success: false,
          message: 'Benutzer wurde nicht gefunden',
          code: 'USER_NOT_FOUND',
          errorId,
          timestamp
        });
      }

      const normalizedEmail = crmUser.salesRepEmail?.toLowerCase() ?? null;

      const { customers: allowedCustomers, hadAssignment } = await loadAssignedCustomers(
        {
          id: crmUser.id,
          email: crmUser.email,
          salesRepEmail: crmUser.salesRepEmail,
          salesRepId: crmUser.salesRepId,
          role: crmUser.role,
        },
        normalizedEmail,
        { timestamp }
      );

      if (!hadAssignment) {
        console.warn('CRM user has no sales representative assignment', { userId: crmUser.id });
        return res.json([]);
      }

      const mappedCustomers: MapCustomer[] = allowedCustomers.map((customer) =>
        mapCustomerToResponse(customer, {
          salesRepId: crmUser.salesRepId,
          salesRepEmail: crmUser.salesRepEmail
        })
      );

      console.log(`Fetched ${mappedCustomers.length} customers assigned to user`, {
        userId: crmUser.id,
        email: crmUser.email,
        timestamp
      });

      return res.json(mappedCustomers);

    } catch (error: any) {
      console.error('Error fetching customers:', {
        errorId,
        message: error.message,
        stack: error.stack,
        userId: req.user?.id,
        timestamp
      });
      
      return res.status(500).json({
        success: false,
        message: 'Fehler beim Abrufen der Kunden',
        code: 'CUSTOMER_FETCH_ERROR',
        errorId,
        timestamp
      });
    }
  });

  app.get('/admin-api/dashboard/orders', auth, async (req: AuthRequest, res) => {
    const timestamp = new Date().toISOString();
    const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    try {
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: 'Nicht autorisiert',
          code: 'UNAUTHORIZED',
          errorId,
          timestamp
        });
      }

      const crmUser = await prisma.crmUser.findUnique({ where: { id: req.user.id } });

      if (!crmUser) {
        return res.status(404).json({
          success: false,
          message: 'Benutzer wurde nicht gefunden',
          code: 'USER_NOT_FOUND',
          errorId,
          timestamp
        });
      }

      const normalizedEmail = crmUser.salesRepEmail?.toLowerCase() ?? null;

      const { customers: assignedCustomers, hadAssignment } = await loadAssignedCustomers(
        {
          id: crmUser.id,
          email: crmUser.email,
          salesRepEmail: crmUser.salesRepEmail,
          salesRepId: crmUser.salesRepId,
          role: crmUser.role,
        },
        normalizedEmail,
        { timestamp }
      );

      if (!hadAssignment) {
        return res.json([] as DashboardOrderSummary[]);
      }

      if (assignedCustomers.length === 0) {
        return res.json([] as DashboardOrderSummary[]);
      }

      const mappedCustomers = assignedCustomers.map((customer) =>
        mapCustomerToResponse(customer, {
          salesRepId: crmUser.salesRepId,
          salesRepEmail: crmUser.salesRepEmail
        })
      );

      const customerLookup = new Map<string, MapCustomer>();
      const customersByNumber = new Map<string, MapCustomer>();
      const customersByEmail = new Map<string, MapCustomer>();

      for (const customer of mappedCustomers) {
        if (customer.id) {
          customerLookup.set(customer.id, customer);
        }
        if (customer.customerNumber) {
          customersByNumber.set(customer.customerNumber.toLowerCase(), customer);
        }
        if (customer.email) {
          customersByEmail.set(customer.email.toLowerCase(), customer);
        }
      }

      const limitParam = extractQueryParam(req.query?.limit);
      const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : NaN;
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, 50)
        : 10;

      const rawOrders = await fetchRecentOrdersForCustomers(Array.from(customerLookup.keys()), limit);

      await hydrateOrdersWithCustomers(rawOrders);

      const diagnosticSample = rawOrders.find((order) => {
        const orderCustomer = order?.orderCustomer ?? {};
        const directId =
          toStringOrNull(orderCustomer?.customerId) ??
          toStringOrNull(orderCustomer?.customer?.id) ??
          toStringOrNull(order?.customerId) ??
          toStringOrNull(order?.customer?.id);
        return !directId;
      });

      if (diagnosticSample) {
        console.warn('Dashboard order diagnostic sample', {
          orderId: toStringOrNull(diagnosticSample?.id),
          orderNumber: toStringOrNull(diagnosticSample?.orderNumber),
          orderKeys: Object.keys(diagnosticSample ?? {}),
          orderCustomerKeys: Object.keys(diagnosticSample?.orderCustomer ?? {}),
          orderCustomer: diagnosticSample?.orderCustomer,
          orderCustomerEntity: diagnosticSample?.customer,
          orderCustomerId: diagnosticSample?.customerId ?? diagnosticSample?.orderCustomer?.customerId
        });
      }
      const referencedCustomerIds = new Set<string>();
      for (const order of rawOrders) {
        const directId =
          toStringOrNull(order?.orderCustomer?.customerId) ??
          toStringOrNull(order?.orderCustomer?.customer?.id) ??
          toStringOrNull(order?.customerId) ??
          toStringOrNull(order?.customer?.id);
        if (directId) {
          referencedCustomerIds.add(directId);
        }
      }

      const missingCustomerIds = Array.from(referencedCustomerIds).filter((id) => !customerLookup.has(id));

      if (missingCustomerIds.length > 0) {
        const synced = await syncCustomersFromShopware(
          {
            id: crmUser.id,
            salesRepEmail: crmUser.salesRepEmail,
            salesRepId: crmUser.salesRepId
          },
          normalizedEmail,
          missingCustomerIds
        );

        for (const customer of synced) {
          const mapped = mapCustomerToResponse(customer as CustomerWithRelations, {
            salesRepId: crmUser.salesRepId,
            salesRepEmail: crmUser.salesRepEmail
          });

          mappedCustomers.push(mapped);

          if (mapped.id) {
            customerLookup.set(mapped.id, mapped);
          }
          if (mapped.customerNumber) {
            customersByNumber.set(mapped.customerNumber.toLowerCase(), mapped);
          }
          if (mapped.email) {
            customersByEmail.set(mapped.email.toLowerCase(), mapped);
          }
        }

        console.log('Loaded additional customers for dashboard orders', {
          userId: crmUser.id,
          requested: missingCustomerIds.length,
          loaded: synced.length,
          timestamp
        });
      }

      const dashboardOrders = rawOrders.map((order) =>
        mapDashboardOrder(order, {
          byId: customerLookup,
          byNumber: customersByNumber,
          byEmail: customersByEmail
        })
      );

      dashboardOrders.forEach((order) => {
        if (!order.customerId) {
          console.warn('Dashboard order returned without customerId', {
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            customerCompany: order.customerCompany
          });
        }
      });

      console.log('Dashboard orders prepared', {
        userId: crmUser.id,
        orderCount: dashboardOrders.length,
        mappedCustomers: mappedCustomers.length,
        missingCustomerAssignments: dashboardOrders.filter((order) => !order.customerId).length,
        timestamp
      });

      const stats: DashboardStats = (() => {
        const totalOrders = dashboardOrders.length;
        const totalRevenue = dashboardOrders.reduce((sum, order) => sum + (order.totalAmount ?? 0), 0);
        const customerCount = customerLookup.size;
        const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
        const latestOrderDate = dashboardOrders.reduce<string | null>((latest, order) => {
          if (!order.orderDate) {
            return latest;
          }
          const current = new Date(order.orderDate).getTime();
          if (!Number.isFinite(current)) {
            return latest;
          }
          if (!latest) {
            return order.orderDate;
          }
          const previous = new Date(latest).getTime();
          return current > previous ? order.orderDate : latest;
        }, null);

        return {
          totalRevenue,
          totalOrders,
          customerCount,
          averageOrderValue,
          latestOrderDate
        } satisfies DashboardStats;
      })();

      const response: DashboardData = {
        orders: dashboardOrders,
        stats
      };

      return res.json(response);
    } catch (error: any) {
      console.error('Failed to fetch dashboard orders', {
        errorId,
        message: error?.message,
        stack: error?.stack,
        userId: req.user?.id,
        timestamp
      });

      return res.status(500).json({
        success: false,
        message: 'Fehler beim Abrufen der Bestellungen',
        code: 'DASHBOARD_ORDERS_ERROR',
        errorId,
        timestamp
      });
    }
  });

  app.get('/admin-api/customer/:id/orders', auth, async (req: AuthRequest, res) => {
    const timestamp = new Date().toISOString();
    const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const customerId = req.params.id;

    try {
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: 'Nicht autorisiert',
          code: 'UNAUTHORIZED',
          errorId,
          timestamp
        });
      }

      if (!customerId) {
        return res.status(400).json({
          success: false,
          message: 'Kunden-ID fehlt',
          code: 'MISSING_CUSTOMER_ID',
          errorId,
          timestamp
        });
      }

      const crmUser = await prisma.crmUser.findUnique({ where: { id: req.user.id } });

      if (!crmUser) {
        return res.status(404).json({
          success: false,
          message: 'Benutzer wurde nicht gefunden',
          code: 'USER_NOT_FOUND',
          errorId,
          timestamp
        });
      }

      const normalizedEmail = crmUser.salesRepEmail?.toLowerCase() ?? null;

      let customer = await prisma.customer.findUnique({
        where: { id: customerId },
        include: customerRelationInclude,
      });

      const customerAssigned = customer && isCustomerAssignedToUser(customer, {
        salesRepId: crmUser.salesRepId,
        salesRepEmail: crmUser.salesRepEmail,
        role: crmUser.role,
      });

      if ((!customer || !customerAssigned) && (crmUser.salesRepId || normalizedEmail)) {
        await syncCustomersFromShopware(
          {
            id: crmUser.id,
            salesRepEmail: crmUser.salesRepEmail,
            salesRepId: crmUser.salesRepId
          },
          normalizedEmail
        );

        customer = await prisma.customer.findUnique({
          where: { id: customerId },
          include: customerRelationInclude,
        });
      }

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Kunde wurde nicht gefunden',
          code: 'CUSTOMER_NOT_FOUND',
          errorId,
          timestamp
        });
      }

      if (!isCustomerAssignedToUser(customer, {
        salesRepId: crmUser.salesRepId,
        salesRepEmail: crmUser.salesRepEmail,
        role: crmUser.role,
      })) {
        return res.status(403).json({
          success: false,
          message: 'Kein Zugriff auf die Bestellungen dieses Kunden',
          code: 'FORBIDDEN',
          errorId,
          timestamp
        });
      }

      const payload = {
        filter: [
          {
            type: 'equals',
            field: 'orderCustomer.customerId',
            value: customerId
          }
        ],
        limit: 100,
        sort: [
          {
            field: 'orderDateTime',
            order: 'DESC'
          }
        ],
        includes: {
          order: [
            'id',
            'orderNumber',
            'orderDateTime',
            'createdAt',
            'amountTotal',
            'amountNet',
            'shippingCosts',
            'price',
            'currencyId',
            'stateId'
          ],
          order_line_item: [
            'id',
            'label',
            'quantity',
            'unitPrice',
            'totalPrice',
            'payload',
            'productId'
          ],
          state_machine_state: [
            'id',
            'name',
            'technicalName'
          ],
          currency: [
            'id',
            'isoCode',
            'shortName',
            'symbol'
          ]
        },
        associations: {
          stateMachineState: {},
          currency: {},
          lineItems: {}
        }
      };

      let shopwareOrders: Array<Record<string, any>> = [];

      try {
        const response = await adminSearch<any>('/search/order', payload);
        shopwareOrders = response?.data ?? [];

        if (shopwareOrders.length === 0) {
          const fallbackFilters: Array<{ type: string; field: string; value: string }> = [];
          if (customer.customerNumber) {
            fallbackFilters.push({
              type: 'equals',
              field: 'orderCustomer.customerNumber',
              value: customer.customerNumber
            });
          }
          if (customer.email) {
            fallbackFilters.push({
              type: 'equals',
              field: 'orderCustomer.email',
              value: customer.email
            });
          }

          for (const filter of fallbackFilters) {
            const fallbackPayload = {
              ...payload,
              filter: [filter]
            };
            try {
              const fallbackResponse = await adminSearch<any>('/search/order', fallbackPayload);
              shopwareOrders = fallbackResponse?.data ?? [];
            } catch (fallbackError) {
              console.warn('Fallback order lookup failed', {
                customerId,
                filter,
                error: fallbackError instanceof Error ? fallbackError.message : fallbackError
              });
            }

            if (shopwareOrders.length > 0) {
              break;
            }
          }
        }
      } catch (orderError) {
        console.error('Failed to fetch orders from Shopware', {
          customerId,
          error: orderError
        });
        return res.status(502).json({
          success: false,
          message: 'Bestellungen konnten nicht aus Shopware geladen werden',
          code: 'SHOPWARE_ORDER_ERROR',
          errorId,
          timestamp
        });
      }

      const orderIds = shopwareOrders
        .map((order) => toStringOrNull(order?.id))
        .filter((value): value is string => Boolean(value));

      const lineItemMap = new Map<string, ParsedOrderLineItem[]>();
      const productIds = new Set<string>();
      const manufacturerIds = new Set<string>();
      const propertyIds = new Set<string>();

      if (orderIds.length > 0) {
        const chunkSize = 25;
        for (let i = 0; i < orderIds.length; i += chunkSize) {
          const chunk = orderIds.slice(i, i + chunkSize);
          if (chunk.length === 0) continue;

          const lineItemPayload = {
            filter: [
              {
                type: 'equalsAny',
                field: 'orderId',
                value: chunk.join('|')
              }
            ],
            limit: Math.min(chunk.length * 50, 500),
            includes: {
              order_line_item: [
                'id',
                'orderId',
                'label',
                'quantity',
                'unitPrice',
                'totalPrice',
                'payload',
                'productId'
              ]
            }
          };

          try {
            const lineItemResponse = await adminSearch<any>('/search/order-line-item', lineItemPayload);
            const items: Array<Record<string, any>> = lineItemResponse?.data ?? [];
            for (const item of items) {
              const orderId = toStringOrNull(item?.orderId);
              if (!orderId) continue;

              const parsed = parseOrderLineItem(item);

              if (!lineItemMap.has(orderId)) {
                lineItemMap.set(orderId, []);
              }
              lineItemMap.get(orderId)!.push(parsed);

              if (parsed.productId) {
                productIds.add(parsed.productId);
              }
              if (parsed.manufacturerId) {
                manufacturerIds.add(parsed.manufacturerId);
              }
              for (const propertyId of parsed.propertyIds) {
                propertyIds.add(propertyId);
              }
            }
          } catch (lineItemError) {
            console.warn('Failed to fetch order line items from Shopware', {
              chunkSize: chunk.length,
              error: lineItemError instanceof Error ? lineItemError.message : lineItemError
            });
          }
        }
      }

      for (const order of shopwareOrders) {
        const orderId = toStringOrNull(order?.id);
        if (!orderId) {
          continue;
        }

        const existingItems = lineItemMap.get(orderId) ?? [];
        if (existingItems.length > 0) {
          continue;
        }

        const embedded = collectEmbeddedLineItems(order).map((raw) => parseOrderLineItem(raw));
        if (embedded.length === 0) {
          continue;
        }

        lineItemMap.set(orderId, embedded);

        for (const item of embedded) {
          if (item.productId) {
            productIds.add(item.productId);
          }
          if (item.manufacturerId) {
            manufacturerIds.add(item.manufacturerId);
          }
          for (const propertyId of item.propertyIds) {
            propertyIds.add(propertyId);
          }
        }
      }

      const productMap = new Map<string, ProductInfo>();
      if (productIds.size > 0) {
        const ids = Array.from(productIds);
        const chunkSize = 25;
        for (let i = 0; i < ids.length; i += chunkSize) {
          const chunk = ids.slice(i, i + chunkSize);
          const productPayload = {
            filter: [
              {
                type: 'equalsAny',
                field: 'id',
                value: chunk.join('|')
              }
            ],
            limit: chunk.length,
            includes: {
              product: [
                'id',
                'manufacturerId',
                'customFields'
              ]
            }
          };

          try {
            const productResponse = await adminSearch<any>('/search/product', productPayload);
            for (const product of productResponse?.data ?? []) {
              const productId = toStringOrNull(product?.id);
              if (!productId) continue;

              const manufacturerId = toStringOrNull(product?.manufacturerId);
              if (manufacturerId) {
                manufacturerIds.add(manufacturerId);
              }

              productMap.set(productId, {
                manufacturerId,
                customFields: typeof product?.customFields === 'object' && product?.customFields !== null
                  ? (product.customFields as Record<string, any>)
                  : null
              });
            }
          } catch (productError) {
            console.warn('Failed to fetch product information from Shopware', {
              chunkSize: chunk.length,
              error: productError instanceof Error ? productError.message : productError
            });
          }
        }
      }

      const manufacturerMap = new Map<string, string | null>();
      if (manufacturerIds.size > 0) {
        const ids = Array.from(manufacturerIds);
        const chunkSize = 50;
        for (let i = 0; i < ids.length; i += chunkSize) {
          const chunk = ids.slice(i, i + chunkSize);
          const manufacturerPayload = {
            filter: [
              {
                type: 'equalsAny',
                field: 'id',
                value: chunk.join('|')
              }
            ],
            limit: chunk.length,
            includes: {
              product_manufacturer: ['id', 'name']
            }
          };

          try {
            const manufacturerResponse = await adminSearch<any>('/search/product-manufacturer', manufacturerPayload);
            for (const manufacturer of manufacturerResponse?.data ?? []) {
              const manufacturerId = toStringOrNull(manufacturer?.id);
              if (!manufacturerId) continue;
              manufacturerMap.set(manufacturerId, toStringOrNull(manufacturer?.name));
            }
          } catch (manufacturerError) {
            console.warn('Failed to fetch manufacturer information from Shopware', {
              chunkSize: chunk.length,
              error: manufacturerError instanceof Error ? manufacturerError.message : manufacturerError
            });
          }
        }
      }

      const propertyOptionMap = new Map<string, PropertyOptionInfo>();
      if (propertyIds.size > 0) {
        const ids = Array.from(propertyIds);
        const chunkSize = 50;
        for (let i = 0; i < ids.length; i += chunkSize) {
          const chunk = ids.slice(i, i + chunkSize);
          const propertyPayload = {
            filter: [
              {
                type: 'equalsAny',
                field: 'id',
                value: chunk.join('|')
              }
            ],
            limit: chunk.length,
            includes: {
              property_group_option: ['id', 'name']
            },
            associations: {
              group: {}
            }
          };

          try {
            const propertyResponse = await adminSearch<any>('/search/property-group-option', propertyPayload);
            for (const option of propertyResponse?.data ?? []) {
              const optionId = toStringOrNull(option?.id);
              if (!optionId) continue;
              const groupName = toStringOrNull(option?.group?.name ?? option?.group?.translated?.name);
              propertyOptionMap.set(optionId, {
                name: toStringOrNull(option?.name),
                groupName
              });
            }
          } catch (propertyError) {
            console.warn('Failed to fetch property option information from Shopware', {
              chunkSize: chunk.length,
              error: propertyError instanceof Error ? propertyError.message : propertyError
            });
          }
        }
      }

      const orders = shopwareOrders.map((order) => {
        const orderId = toStringOrNull(order?.id);
        const parsedLineItems = orderId ? lineItemMap.get(orderId) ?? [] : [];
        const preparedLineItems = parsedLineItems.map((lineItem) =>
          mapLineItemDetails(lineItem, manufacturerMap, productMap, propertyOptionMap)
        );

        const lineItemsOverride = preparedLineItems.length > 0 ? preparedLineItems : undefined; // let mapShopwareOrder fall back to embedded lineItems when lookup returned none
        return mapShopwareOrder(order, lineItemsOverride);
      });

      return res.json(orders);
    } catch (error: any) {
      console.error('Error fetching customer orders', {
        errorId,
        message: error?.message,
        stack: error?.stack,
        customerId,
        userId: req.user?.id,
        timestamp
      });

      return res.status(500).json({
        success: false,
        message: 'Fehler beim Abrufen der Bestellungen',
        code: 'CUSTOMER_ORDERS_ERROR',
        errorId,
        timestamp
      });
    }
  });

  app.get(
    '/admin-api/customer/:id/wishlist',
    auth,
    async (req: AuthRequest, res: Response<CustomerWishlistResponse | Record<string, unknown>>) => {
      const timestamp = new Date().toISOString();
      const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const customerId = req.params.id;

      try {
        if (!req.user?.id) {
          return res.status(401).json({
            success: false,
            message: 'Nicht autorisiert',
            code: 'UNAUTHORIZED',
            errorId,
            timestamp,
          });
        }

        if (!customerId) {
          return res.status(400).json({
            success: false,
            message: 'Kunden-ID fehlt',
            code: 'MISSING_CUSTOMER_ID',
            errorId,
            timestamp,
          });
        }

        let shopwareCustomerId: string | null = null;
        try {
          const { customer } = await ensureCustomerAccess(customerId, req.user.id);
          shopwareCustomerId =
            toStringOrNull((customer as any).shopwareCustomerId ?? null) ??
            toStringOrNull(customer.id);
        } catch (error) {
          if (error instanceof CustomerAccessError) {
            return res.status(error.status).json({
              success: false,
              message: error.message,
              code: error.code,
              errorId,
              timestamp,
            });
          }
          throw error;
        }

        if (!shopwareCustomerId) {
          return res.json({ items: [] } satisfies CustomerWishlistResponse);
        }

        const assortmentResponse = await adminSearch<any>('/search/vinaturel-my-assortment', {
          filter: [
            {
              type: 'equals',
              field: 'customerId',
              value: shopwareCustomerId,
            },
          ],
          limit: 500,
        });

        const assortmentEntries: Array<Record<string, any>> = assortmentResponse?.data ?? [];
        console.log('Fetched customer wishlist', {
          customerId,
          shopwareCustomerId,
          wishlistCount: assortmentEntries.length,
        });

        const items = await mapMyAssortmentEntries(assortmentEntries);
        return res.json({ items } satisfies CustomerWishlistResponse);
      } catch (error) {
        console.error('Error fetching customer wishlist', {
          errorId,
          message: (error as Error)?.message,
          stack: (error as Error)?.stack,
          customerId,
          userId: req.user?.id,
          timestamp,
        });

        return res.status(500).json({
          success: false,
          message: 'Fehler beim Abrufen der Merkliste',
          code: 'CUSTOMER_WISHLIST_ERROR',
          errorId,
          timestamp,
        });
      }
    }
  );

  app.post(
    '/admin-api/customer/:id/wishlist',
    auth,
    async (req: AuthRequest, res: Response<Record<string, unknown>>) => {
      const timestamp = new Date().toISOString();
      const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const customerId = req.params.id;

      try {
        if (!req.user?.id) {
          return res.status(401).json({
            success: false,
            message: 'Nicht autorisiert',
            code: 'UNAUTHORIZED',
            errorId,
            timestamp,
          });
        }

        if (!customerId) {
          return res.status(400).json({
            success: false,
            message: 'Kunden-ID fehlt',
            code: 'MISSING_CUSTOMER_ID',
            errorId,
            timestamp,
          });
        }

        const { customer } = await ensureCustomerAccess(customerId, req.user.id);
        const shopwareCustomerId =
          toStringOrNull((customer as any).shopwareCustomerId ?? null) ??
          toStringOrNull(customer.id);

        if (!shopwareCustomerId) {
          return res.status(400).json({
            success: false,
            message: 'Shopware-Kundenzuordnung fehlt',
            code: 'MISSING_SHOPWARE_CUSTOMER',
            errorId,
            timestamp,
          });
        }

        const payload = (req.body ?? {}) as { productId?: unknown; articleNumber?: unknown };
        let productId = toStringOrNull(payload.productId);
        const articleNumber = toStringOrNull(payload.articleNumber);

        if (!productId && !articleNumber) {
          return res.status(400).json({
            success: false,
            message: 'Produktreferenz fehlt',
            code: 'MISSING_PRODUCT_REFERENCE',
            errorId,
            timestamp,
          });
        }

        if (!productId && articleNumber) {
          const productResponse = await adminSearch<any>('/search/product', {
            filter: [
              {
                type: 'equals',
                field: 'productNumber',
                value: articleNumber,
              },
            ],
            limit: 1,
          });

          const product = productResponse?.data?.[0] ?? null;
          productId = toStringOrNull(product?.id);

          if (!productId) {
            return res.status(404).json({
              success: false,
              message: `Kein Produkt mit der Artikelnummer ${articleNumber} gefunden`,
              code: 'PRODUCT_NOT_FOUND',
              errorId,
              timestamp,
            });
          }
        }

        if (!productId) {
          return res.status(404).json({
            success: false,
            message: 'Produkt wurde nicht gefunden',
            code: 'PRODUCT_NOT_FOUND',
            errorId,
            timestamp,
          });
        }

        const existingResponse = await adminSearch<any>('/search/vinaturel-my-assortment', {
          filter: [
            {
              type: 'equals',
              field: 'customerId',
              value: shopwareCustomerId,
            },
            {
              type: 'equals',
              field: 'productId',
              value: productId,
            },
          ],
          limit: 1,
          includes: {
            vinaturel_my_assortment: ['id', 'productId', 'customerId', 'createdAt', 'updatedAt'],
          },
        });

        if ((existingResponse?.data?.length ?? 0) > 0) {
          const items = await mapMyAssortmentEntries(existingResponse?.data ?? []);
          return res.status(200).json({
            item: items[0] ?? null,
            success: true,
            message: 'Produkt ist bereits im Sortiment vorhanden',
            code: 'ALREADY_EXISTS',
          });
        }

        const adminClient = await getAdminAxios();
        const createResponse = await adminClient.post('/_action/sync', [
          {
            action: 'upsert',
            entity: 'vinaturel_my_assortment',
            payload: [
              {
                productId,
                productVersionId: '0fa91ce3e96a4bc2be4bd9ce752c3425',
                customerId: shopwareCustomerId,
              },
            ],
          },
        ]);

        let createdId = toStringOrNull(createResponse?.data?.data?.[0]?.payload?.[0]?.id ?? null);

        if (!createdId) {
          const latestResponse = await adminSearch<any>('/search/vinaturel-my-assortment', {
            filter: [
              {
                type: 'equals',
                field: 'customerId',
                value: shopwareCustomerId,
              },
              {
                type: 'equals',
                field: 'productId',
                value: productId,
              },
            ],
            limit: 1,
            sort: [
              {
                field: 'createdAt',
                order: 'DESC' as const,
              },
            ],
          });
          createdId = toStringOrNull(latestResponse?.data?.[0]?.id ?? null);
        }

        const entryFilters = createdId
          ? [
              {
                type: 'equals',
                field: 'id',
                value: createdId,
              },
            ]
          : [
              {
                type: 'equals',
                field: 'customerId',
                value: shopwareCustomerId,
              },
              {
                type: 'equals',
                field: 'productId',
                value: productId,
              },
            ];

        const entryResponse = await adminSearch<any>('/search/vinaturel-my-assortment', {
          filter: entryFilters,
          limit: 1,
          includes: {
            vinaturel_my_assortment: ['id', 'productId', 'customerId', 'createdAt', 'updatedAt'],
          },
        });

        const items = await mapMyAssortmentEntries(entryResponse?.data ?? []);
        const item = items[0] ?? null;

        return res.status(201).json({ item });
      } catch (error) {
        console.error('Error adding wishlist entry', {
          errorId,
          message: (error as Error)?.message,
          stack: (error as Error)?.stack,
          customerId,
          userId: req.user?.id,
          timestamp,
        });

        return res.status(500).json({
          success: false,
          message: 'Wein konnte nicht hinzugefügt werden',
          code: 'CUSTOMER_WISHLIST_ADD_ERROR',
          errorId,
          timestamp,
        });
      }
    }
  );

  app.delete(
    '/admin-api/customer/:id/wishlist/:entryId',
    auth,
    async (req: AuthRequest, res: Response<Record<string, unknown>>) => {
      const timestamp = new Date().toISOString();
      const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const customerId = req.params.id;
      const entryId = req.params.entryId;

      try {
        if (!req.user?.id) {
          return res.status(401).json({
            success: false,
            message: 'Nicht autorisiert',
            code: 'UNAUTHORIZED',
            errorId,
            timestamp,
          });
        }

        if (!customerId || !entryId) {
          return res.status(400).json({
            success: false,
            message: 'Kunden- oder Eintrags-ID fehlt',
            code: 'MISSING_IDENTIFIERS',
            errorId,
            timestamp,
          });
        }

        const { customer } = await ensureCustomerAccess(customerId, req.user.id);
        const shopwareCustomerId =
          toStringOrNull((customer as any).shopwareCustomerId ?? null) ??
          toStringOrNull(customer.id);

        if (!shopwareCustomerId) {
          return res.status(400).json({
            success: false,
            message: 'Shopware-Kundenzuordnung fehlt',
            code: 'MISSING_SHOPWARE_CUSTOMER',
            errorId,
            timestamp,
          });
        }

        const listResponse = await adminSearch<any>('/search/vinaturel-my-assortment', {
          filter: [
            {
              type: 'equals',
              field: 'customerId',
              value: shopwareCustomerId,
            },
          ],
          limit: 500,
          includes: {
            vinaturel_my_assortment: ['id', 'productId', 'customerId', 'createdAt', 'updatedAt'],
          },
        });

        const entries = listResponse?.data ?? [];
        const matchedEntry = entries.find((entry) => {
          const productIdCandidate = toStringOrNull(entry?.productId);
          const customerIdCandidate = toStringOrNull(entry?.customerId);
          const persistedId = toStringOrNull(entry?.id);
          const uniqueId = toStringOrNull((entry as Record<string, any>)?._uniqueIdentifier ?? null);

          if (entryId && persistedId && entryId === persistedId) return true;
          if (entryId && uniqueId && entryId === uniqueId) return true;
          if (entryId && productIdCandidate && entryId === productIdCandidate) return true;
          if (entryId && productIdCandidate && customerIdCandidate && entryId === `${productIdCandidate}-${customerIdCandidate}`) return true;
          return false;
        });

        const productIdForRemoval = toStringOrNull(matchedEntry?.productId);

        if (!productIdForRemoval) {
          return res.status(404).json({
            success: false,
            message: 'Eintrag wurde nicht gefunden',
            code: 'WISHLIST_ENTRY_NOT_FOUND',
            errorId,
            timestamp,
          });
        }

        const adminClient = await getAdminAxios();
        await adminClient.post('/_action/sync', [
          {
            action: 'delete',
            entity: 'vinaturel_my_assortment',
            payload: [
              {
                productId: productIdForRemoval,
                customerId: shopwareCustomerId,
              },
            ],
          },
        ]);

        return res.status(204).send();
      } catch (error) {
        console.error('Error removing wishlist entry', {
          errorId,
          message: (error as Error)?.message,
          stack: (error as Error)?.stack,
          customerId,
          entryId,
          userId: req.user?.id,
          timestamp,
        });

        return res.status(500).json({
          success: false,
          message: 'Wein konnte nicht entfernt werden',
          code: 'CUSTOMER_WISHLIST_REMOVE_ERROR',
          errorId,
          timestamp,
        });
      }
    }
  );

  app.get('/admin-api/customer/:id', auth, async (req: AuthRequest, res) => {
    const timestamp = new Date().toISOString();
    const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const customerId = req.params.id;

    console.log('Fetching customer detail for CRM user', {
      userId: req.user?.id,
      customerId,
      timestamp
    });

    try {
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: 'Nicht autorisiert',
          code: 'UNAUTHORIZED',
          errorId,
          timestamp
        });
      }

      if (!customerId) {
        return res.status(400).json({
          success: false,
          message: 'Kunden-ID fehlt',
          code: 'MISSING_CUSTOMER_ID',
          errorId,
          timestamp
        });
      }

      const crmUser = await prisma.crmUser.findUnique({ where: { id: req.user.id } });

      if (!crmUser) {
        return res.status(404).json({
          success: false,
          message: 'Benutzer wurde nicht gefunden',
          code: 'USER_NOT_FOUND',
          errorId,
          timestamp
        });
      }

      const normalizedEmail = crmUser.salesRepEmail?.toLowerCase() ?? null;

      let customer = await prisma.customer.findUnique({
        where: { id: customerId },
        include: customerRelationInclude,
      });

      const customerAssigned = customer && isCustomerAssignedToUser(customer, {
        salesRepId: crmUser.salesRepId,
        salesRepEmail: crmUser.salesRepEmail,
        role: crmUser.role,
      });

      if ((!customer || !customerAssigned) && (crmUser.salesRepId || normalizedEmail)) {
        await syncCustomersFromShopware({
          id: crmUser.id,
          salesRepEmail: crmUser.salesRepEmail,
          salesRepId: crmUser.salesRepId
        }, normalizedEmail);

        customer = await prisma.customer.findUnique({
          where: { id: customerId },
          include: customerRelationInclude,
        });
      }

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Kunde wurde nicht gefunden',
          code: 'CUSTOMER_NOT_FOUND',
          errorId,
          timestamp
        });
      }

      if (!isCustomerAssignedToUser(customer, {
        salesRepId: crmUser.salesRepId,
        salesRepEmail: crmUser.salesRepEmail,
        role: crmUser.role,
      })) {
        return res.status(403).json({
          success: false,
          message: 'Kein Zugriff auf diese Kundenakte',
          code: 'FORBIDDEN',
          errorId,
          timestamp
        });
      }

      const mappedCustomer = mapCustomerToResponse(customer, {
        salesRepId: crmUser.salesRepId,
        salesRepEmail: crmUser.salesRepEmail
      });

      return res.json(mappedCustomer);

    } catch (error: any) {
      console.error('Error fetching customer detail:', {
        errorId,
        message: error.message,
        stack: error.stack,
        userId: req.user?.id,
        timestamp
      });

      return res.status(500).json({
        success: false,
        message: 'Fehler beim Abrufen der Kundenakte',
        code: 'CUSTOMER_DETAIL_ERROR',
        errorId,
        timestamp
      });
    }
  });

  app.get(
    '/admin-api/customer/:id/interactions',
    auth,
    async (req: AuthRequest, res: Response<CustomerInteractionsResponse | Record<string, unknown>>) => {
      const timestamp = new Date().toISOString();
      const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const customerId = req.params.id;

      try {
        if (!req.user?.id) {
          return res.status(401).json({
            success: false,
            message: 'Nicht autorisiert',
            code: 'UNAUTHORIZED',
            errorId,
            timestamp,
          });
        }

        if (!customerId) {
          return res.status(400).json({
            success: false,
            message: 'Kunden-ID fehlt',
            code: 'MISSING_CUSTOMER_ID',
            errorId,
            timestamp,
          });
        }

        await ensureCustomerAccess(customerId, req.user.id);

        const records = await prisma.customerInteraction.findMany({
          where: { customerId },
          orderBy: [{ occurredAt: 'desc' as const }, { createdAt: 'desc' as const }],
        });

        return res.json({
          interactions: records.map(mapInteractionToResponse),
        });
      } catch (error) {
        if (error instanceof CustomerAccessError) {
          return res.status(error.status).json({
            success: false,
            message: error.message,
            code: error.code,
            errorId,
            timestamp,
          });
        }

        console.error('Error fetching customer interactions', {
          errorId,
          message: (error as Error)?.message,
          stack: (error as Error)?.stack,
          userId: req.user?.id,
          timestamp,
        });

        return res.status(500).json({
          success: false,
          message: 'Fehler beim Laden der Interaktionen',
          code: 'INTERACTIONS_FETCH_ERROR',
          errorId,
          timestamp,
        });
      }
    }
  );

  app.post(
    '/admin-api/customer/:id/interactions',
    auth,
    async (req: AuthRequest, res: Response<Record<string, unknown>>) => {
      const timestamp = new Date().toISOString();
      const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const customerId = req.params.id;

      try {
        if (!req.user?.id) {
          return res.status(401).json({
            success: false,
            message: 'Nicht autorisiert',
            code: 'UNAUTHORIZED',
            errorId,
            timestamp,
          });
        }

        if (!customerId) {
          return res.status(400).json({
            success: false,
            message: 'Kunden-ID fehlt',
            code: 'MISSING_CUSTOMER_ID',
            errorId,
            timestamp,
          });
        }

        const { crmUser } = await ensureCustomerAccess(customerId, req.user.id);

        const payload = req.body as CreateCustomerInteractionRequest;

        if (!payload || typeof payload !== 'object') {
          return res.status(400).json({
            success: false,
            message: 'Ungültige Daten',
            code: 'INVALID_BODY',
            errorId,
            timestamp,
          });
        }

        const allowedTypes: Array<CreateCustomerInteractionRequest['type']> = ['phone', 'email', 'meeting', 'chat'];

        if (!allowedTypes.includes(payload.type)) {
          return res.status(400).json({
            success: false,
            message: `Ungültiger Interaktionstyp: ${payload.type}`,
            code: 'INVALID_INTERACTION_TYPE',
            errorId,
            timestamp,
          });
        }

        const occurredAt = new Date(payload.occurredAt ?? Date.now());
        if (Number.isNaN(occurredAt.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Ungültiges Datum',
            code: 'INVALID_DATE',
            errorId,
            timestamp,
          });
        }

        const durationSeconds =
          payload.durationSeconds !== undefined && payload.durationSeconds !== null
            ? Number(payload.durationSeconds)
            : null;

        if (durationSeconds !== null && (!Number.isFinite(durationSeconds) || durationSeconds < 0)) {
          return res.status(400).json({
            success: false,
            message: 'Ungültige Dauer',
            code: 'INVALID_DURATION',
            errorId,
            timestamp,
          });
        }

        const followUpDueDate = payload.followUp?.dueDate ? new Date(payload.followUp.dueDate) : null;
        if (followUpDueDate && Number.isNaN(followUpDueDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Ungültiges Fälligkeitsdatum',
            code: 'INVALID_FOLLOWUP_DUE_DATE',
            errorId,
            timestamp,
          });
        }

        let followUpAssignedUser: { id: string; firstName: string | null; lastName: string | null; email: string } | null = null;
        if (payload.followUp?.assignee) {
          followUpAssignedUser = await prisma.crmUser.findUnique({
            where: { id: payload.followUp.assignee },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          });

          if (!followUpAssignedUser) {
            return res.status(400).json({
              success: false,
              message: 'Unbekannter Verantwortlicher für die Folgeaufgabe',
              code: 'INVALID_ASSIGNEE',
              errorId,
              timestamp,
            });
          }
        }

        const followUpAssigneeName = payload.followUp
          ? formatUserName(followUpAssignedUser ?? {
              firstName: crmUser.firstName ?? null,
              lastName: crmUser.lastName ?? null,
              email: crmUser.email,
            })
          : null;

        const createData: Prisma.CustomerInteractionUncheckedCreateInput = {
          customerId,
          type: payload.type,
          occurredAt,
          employee: payload.employee ?? null,
          durationSeconds: durationSeconds ?? null,
          topic: payload.topic ?? null,
          result: payload.result ?? null,
          notes: payload.notes ?? null,
          attachmentsCount: payload.attachmentsCount ?? null,
          followUpTitle: payload.followUp?.title ?? null,
          followUpDueDate: followUpDueDate,
          followUpAssignee: followUpAssigneeName,
          followUpPriority: payload.followUp?.priority ?? null,
          followUpReminder: payload.followUp?.reminder ?? null,
          followUpTaskId: null,
        };

        if (payload.metadata !== undefined) {
          createData.metadata =
            payload.metadata === null
              ? Prisma.JsonNull
              : (payload.metadata as Prisma.InputJsonValue);
        }

        const result = await prisma.$transaction(async (tx) => {
          let created = await tx.customerInteraction.create({ data: createData });
          let followUpTask: PrismaTask | null = null;

          if (payload.followUp) {
            const assignedToId = followUpAssignedUser?.id ?? crmUser.id;
            const followUpPriorityValue = payload.followUp?.priority && isTaskPriority(payload.followUp.priority)
              ? payload.followUp.priority
              : 'medium';

            followUpTask = await tx.task.create({
              data: {
                title: payload.followUp.title ?? payload.topic ?? 'Follow-up Aufgabe',
                description: payload.notes ?? payload.result ?? null,
                status: 'open',
                priority: followUpPriorityValue,
                category: 'follow_up',
                customerId,
                assignedToId,
                createdById: crmUser.id,
                startAt: occurredAt,
                dueAt: followUpDueDate,
                metadata: {
                  interactionType: payload.type,
                  interactionTopic: payload.topic ?? null,
                },
              },
            include: taskFetchArgs.include,
            });

            created = await tx.customerInteraction.update({
              where: { id: created.id },
              data: { followUpTaskId: followUpTask.id, followUpAssignee: followUpAssigneeName },
            });
          }

          const existing = await tx.customer.findUnique({
            where: { id: customerId },
            select: { lastContactAt: true },
          });

          if (!existing?.lastContactAt || existing.lastContactAt < occurredAt) {
            await tx.customer.update({
              where: { id: customerId },
              data: { lastContactAt: occurredAt },
            });
          }

          return { interaction: created, followUpTaskId: followUpTask?.id ?? null };
        });

        const interactionRecord = await prisma.customerInteraction.findUnique({
          where: { id: result.interaction.id },
        });

        return res.status(201).json({
          interaction: mapInteractionToResponse(interactionRecord ?? result.interaction),
        });
      } catch (error) {
        if (error instanceof CustomerAccessError) {
          return res.status(error.status).json({
            success: false,
            message: error.message,
            code: error.code,
            errorId,
            timestamp,
          });
        }

        console.error('Error creating customer interaction', {
          errorId,
          message: (error as Error)?.message,
          stack: (error as Error)?.stack,
          userId: req.user?.id,
          timestamp,
        });

        return res.status(500).json({
          success: false,
          message: 'Fehler beim Speichern der Interaktion',
          code: 'INTERACTION_CREATE_ERROR',
          errorId,
          timestamp,
        });
      }
    }
  );

  app.get('/admin-api/tasks', auth, async (req: AuthRequest, res: Response<TaskListResponse | Record<string, unknown>>) => {
    const timestamp = new Date().toISOString();
    const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    try {
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: 'Nicht autorisiert',
          code: 'UNAUTHORIZED',
          errorId,
          timestamp,
        });
      }

      const currentUser = await prisma.crmUser.findUnique({ where: { id: req.user.id } });
      if (!currentUser) {
        return res.status(404).json({
          success: false,
          message: 'Benutzer wurde nicht gefunden',
          code: 'USER_NOT_FOUND',
          errorId,
          timestamp,
        });
      }

      const managementView = isManagementRole(currentUser.role);

      const where: Prisma.TaskWhereInput = {
        OR: [
          { assignedToId: currentUser.id },
          { createdById: currentUser.id },
          {
            watchers: {
              some: {
                userId: currentUser.id,
              },
            },
          },
        ],
      };

      const statusParam = extractQueryParam(req.query.status);
      if (statusParam) {
        const statuses = statusParam
          .split(',')
          .map((status) => status.trim())
          .filter(isTaskStatus);
        if (statuses.length > 0) {
          where.status = { in: statuses };
        }
      }

      const assigneeParam = extractQueryParam(req.query.assignee);
      if (assigneeParam) {
        const values = assigneeParam
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
        if (managementView) {
          if (values.includes('unassigned')) {
            pushOrClause(where, { assignedToId: null });
          }
          const specificAssignees = values.filter((value) => value !== 'unassigned');
          if (specificAssignees.length > 0) {
            const clause: Prisma.TaskWhereInput = { assignedToId: { in: specificAssignees } };
            pushAndClause(where, clause);
          }
        } else {
          if (values.includes(currentUser.id)) {
            const clause: Prisma.TaskWhereInput = { assignedToId: currentUser.id };
            pushAndClause(where, clause);
          }
        }
      }

      const customerParam = extractQueryParam(req.query.customerId);
      if (customerParam) {
        where.customerId = customerParam;
      }

      const priorityParam = extractQueryParam(req.query.priority);
      if (priorityParam) {
        const priorities = priorityParam
          .split(',')
          .map((value) => value.trim())
          .filter(isTaskPriority);
        if (priorities.length > 0) {
          where.priority = { in: priorities };
        }
      }

      const categoryParam = extractQueryParam(req.query.category);
      if (categoryParam) {
        const categories = categoryParam
          .split(',')
          .map((value) => value.trim())
          .filter(isTaskCategory);
        if (categories.length > 0) {
          where.category = { in: categories };
        }
      }

      const searchParam = extractQueryParam(req.query.search)?.toLowerCase();
      if (searchParam) {
        const searchClause: Prisma.TaskWhereInput = {
          OR: [
            { title: { contains: searchParam, mode: 'insensitive' } },
            { description: { contains: searchParam, mode: 'insensitive' } },
          ],
        };
        pushAndClause(where, searchClause);
      }

      const fromParam = extractQueryParam(req.query.from);
      const toParam = extractQueryParam(req.query.to);
      if (fromParam || toParam) {
        const dueClause: Prisma.TaskWhereInput = {
          OR: [
            {
              dueAt: {
                gte: fromParam ? new Date(fromParam) : undefined,
                lte: toParam ? new Date(toParam) : undefined,
              },
            },
            {
              startAt: {
                gte: fromParam ? new Date(fromParam) : undefined,
                lte: toParam ? new Date(toParam) : undefined,
              },
            },
          ],
        } satisfies Prisma.TaskWhereInput;
        pushAndClause(where, dueClause);
      }

      const rawTasks = await prisma.task.findMany({
        where,
        include: taskFetchArgs.include,
        orderBy: [
          { dueAt: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
        take: 500,
      });

      const tasks = rawTasks as TaskWithRelations[];

      const tasksDto = tasks.map(mapTaskToResponse);

      const summary = tasks.reduce<TaskSummary>(
        (accumulator, task) => {
          switch (task.status) {
            case 'open':
              accumulator.open += 1;
              break;
            case 'in_progress':
              accumulator.inProgress += 1;
              break;
            case 'waiting':
              accumulator.waiting += 1;
              break;
            case 'completed':
              accumulator.completed += 1;
              break;
            default:
              break;
          }
          return accumulator;
        },
        { open: 0, inProgress: 0, waiting: 0, completed: 0 }
      );

      return res.json({ tasks: tasksDto, summary });
    } catch (error) {
      console.error('Error fetching tasks', {
        message: (error as Error)?.message,
        stack: (error as Error)?.stack,
        errorId,
        timestamp,
      });

      return res.status(500).json({
        success: false,
        message: 'Fehler beim Laden der Aufgaben',
        code: 'TASK_FETCH_ERROR',
        errorId,
        timestamp,
      });
    }
  });

  app.post('/admin-api/tasks', auth, async (req: AuthRequest, res: Response<TaskResponse | Record<string, unknown>>) => {
    const timestamp = new Date().toISOString();
    const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    try {
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: 'Nicht autorisiert',
          code: 'UNAUTHORIZED',
          errorId,
          timestamp,
        });
      }

      const currentUser = await prisma.crmUser.findUnique({ where: { id: req.user.id } });
      if (!currentUser) {
        return res.status(404).json({
          success: false,
          message: 'Benutzer wurde nicht gefunden',
          code: 'USER_NOT_FOUND',
          errorId,
          timestamp,
        });
      }

      const managementView = isManagementRole(currentUser.role);

      const parsedPayload = createTaskSchema.safeParse(req.body ?? {});
      if (!parsedPayload.success) {
        return res.status(400).json({
          success: false,
          message: 'Ungültige Aufgabendaten',
          code: 'INVALID_TASK_PAYLOAD',
          errorId,
          timestamp,
          issues: parsedPayload.error.flatten(),
        });
      }

      const payload = parsedPayload.data as CreateTaskRequest;

      const dueAt = parseDateInput(payload.dueAt ?? null);
      if (payload.dueAt && !dueAt) {
        return res.status(400).json({
          success: false,
          message: 'Ungültiges Fälligkeitsdatum',
          code: 'INVALID_DUE_AT',
          errorId,
          timestamp,
        });
      }

      const startAt = parseDateInput(payload.startAt ?? null);
      if (payload.startAt && !startAt) {
        return res.status(400).json({
          success: false,
          message: 'Ungültiger Startzeitpunkt',
          code: 'INVALID_START_AT',
          errorId,
          timestamp,
        });
      }

      const assignedToId = (() => {
        if (payload.assignedToId === '') return null;
        if (payload.assignedToId) return payload.assignedToId;
        return managementView ? null : currentUser.id;
      })();

      if (assignedToId) {
        const assignee = await prisma.crmUser.findUnique({ where: { id: assignedToId }, select: { id: true } });
        if (!assignee) {
          return res.status(400).json({
            success: false,
            message: 'Unbekannter Verantwortlicher für die Aufgabe',
            code: 'INVALID_ASSIGNEE',
            errorId,
            timestamp,
          });
        }
      }

     const taskCreateData: Prisma.TaskUncheckedCreateInput = {
       title: payload.title,
       description: payload.description ?? null,
       status: payload.status ?? 'open',
       priority: payload.priority ?? 'medium',
       category: payload.category ?? 'other',
       customerId: payload.customerId ?? null,
       assignedToId,
       createdById: currentUser.id,
       startAt,
       dueAt,
       slaMinutes: payload.slaMinutes ?? null,
     };

     const taskMetadata = toJsonInput(payload.metadata);
     if (taskMetadata !== undefined) {
       taskCreateData.metadata = taskMetadata;
     }

      const watcherIds = Array.from(new Set(payload.watcherIds ?? [])).filter(Boolean);

      const task = await prisma.$transaction(async (tx) => {
        const created = await tx.task.create({
          data: taskCreateData,
        });

        if (watcherIds.length > 0) {
          const validUsers = await tx.crmUser.findMany({
            where: { id: { in: watcherIds } },
            select: { id: true },
          });
          if (validUsers.length > 0) {
            await tx.taskWatcher.createMany({
              data: validUsers.map((user) => ({ taskId: created.id, userId: user.id })),
              skipDuplicates: true,
            });
          }
        }

        const hydrated = await tx.task.findUnique({
          where: { id: created.id },
          include: taskFetchArgs.include,
        });

        return hydrated as TaskWithRelations;
      });

      return res.status(201).json({ task: mapTaskToResponse(task) });
    } catch (error) {
      console.error('Error creating task', {
        message: (error as Error)?.message,
        stack: (error as Error)?.stack,
        errorId,
        timestamp,
      });

      return res.status(500).json({
        success: false,
        message: 'Fehler beim Erstellen der Aufgabe',
        code: 'TASK_CREATE_ERROR',
        errorId,
        timestamp,
      });
    }
  });

  app.patch('/admin-api/tasks/:id', auth, async (req: AuthRequest, res: Response<TaskResponse | Record<string, unknown>>) => {
    const timestamp = new Date().toISOString();
    const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const taskId = req.params.id;

    try {
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: 'Nicht autorisiert',
          code: 'UNAUTHORIZED',
          errorId,
          timestamp,
        });
      }

      const currentUser = await prisma.crmUser.findUnique({ where: { id: req.user.id } });
      if (!currentUser) {
        return res.status(404).json({
          success: false,
          message: 'Benutzer wurde nicht gefunden',
          code: 'USER_NOT_FOUND',
          errorId,
          timestamp,
        });
      }

      const existingTask = (await prisma.task.findUnique({
        where: { id: taskId },
        include: taskFetchArgs.include,
      })) as TaskWithRelations | null;

      if (!existingTask) {
        return res.status(404).json({
          success: false,
          message: 'Aufgabe wurde nicht gefunden',
          code: 'TASK_NOT_FOUND',
          errorId,
          timestamp,
        });
      }

      const managementView = isManagementRole(currentUser.role);

      if (
        !managementView &&
        existingTask.assignedToId !== currentUser.id &&
        existingTask.createdById !== currentUser.id
      ) {
        return res.status(403).json({
          success: false,
          message: 'Keine Berechtigung für diese Aufgabe',
          code: 'FORBIDDEN',
          errorId,
          timestamp,
        });
      }

      const parsedPayload = updateTaskSchema.safeParse(req.body ?? {});
      if (!parsedPayload.success) {
        return res.status(400).json({
          success: false,
          message: 'Ungültige Änderungen',
          code: 'INVALID_TASK_UPDATE',
          errorId,
          timestamp,
          issues: parsedPayload.error.flatten(),
        });
      }

      const payload = parsedPayload.data as UpdateTaskRequest;

      if (Object.keys(payload).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Keine Änderungen übermittelt',
          code: 'EMPTY_UPDATE',
          errorId,
          timestamp,
        });
      }

      const updateData: Prisma.TaskUncheckedUpdateInput = {};

      if (payload.title !== undefined) updateData.title = payload.title;
      if (payload.description !== undefined) updateData.description = payload.description;
      if (payload.status !== undefined) updateData.status = payload.status;
      if (payload.priority !== undefined) updateData.priority = payload.priority;
      if (payload.category !== undefined) updateData.category = payload.category;
      if (payload.customerId !== undefined) updateData.customerId = payload.customerId;

      if (payload.assignedToId !== undefined) {
        if (payload.assignedToId) {
          const assignee = await prisma.crmUser.findUnique({ where: { id: payload.assignedToId }, select: { id: true } });
          if (!assignee) {
            return res.status(400).json({
              success: false,
              message: 'Unbekannter Verantwortlicher für die Aufgabe',
              code: 'INVALID_ASSIGNEE',
              errorId,
              timestamp,
            });
          }
        }
        updateData.assignedToId = payload.assignedToId ?? null;
      }

      if (payload.startAt !== undefined) {
        const startAt = parseDateInput(payload.startAt);
        if (payload.startAt && !startAt) {
          return res.status(400).json({
            success: false,
            message: 'Ungültiger Startzeitpunkt',
            code: 'INVALID_START_AT',
            errorId,
            timestamp,
          });
        }
        updateData.startAt = startAt;
      }

      if (payload.dueAt !== undefined) {
        const dueAt = parseDateInput(payload.dueAt);
        if (payload.dueAt && !dueAt) {
          return res.status(400).json({
            success: false,
            message: 'Ungültiges Fälligkeitsdatum',
            code: 'INVALID_DUE_AT',
            errorId,
            timestamp,
          });
        }
        updateData.dueAt = dueAt;
      }

      if (payload.startedAt !== undefined) {
        const startedAt = parseDateInput(payload.startedAt);
        if (payload.startedAt && !startedAt) {
          return res.status(400).json({
            success: false,
            message: 'Ungültige Startzeit',
            code: 'INVALID_STARTED_AT',
            errorId,
            timestamp,
          });
        }
        updateData.startedAt = startedAt;
      }

      if (payload.completedAt !== undefined) {
        const completedAt = parseDateInput(payload.completedAt);
        if (payload.completedAt && !completedAt) {
          return res.status(400).json({
            success: false,
            message: 'Ungültige Abschlusszeit',
            code: 'INVALID_COMPLETED_AT',
            errorId,
            timestamp,
          });
        }
        updateData.completedAt = completedAt;
      }

      if (payload.slaMinutes !== undefined) {
        updateData.slaMinutes = payload.slaMinutes;
      }

      if (payload.metadata !== undefined) {
        const metadataValue = toJsonInput(payload.metadata ?? undefined);
        if (metadataValue !== undefined) {
          updateData.metadata = metadataValue;
        }
      }

      if (payload.status === 'completed' && updateData.completedAt === undefined && !existingTask.completedAt) {
        updateData.completedAt = new Date();
      }

      const updatedTask = await prisma.$transaction(async (tx) => {
        if (payload.watchers) {
          const addIds = Array.from(new Set(payload.watchers.add ?? [])).filter(Boolean);
          const removeIds = Array.from(new Set(payload.watchers.remove ?? [])).filter(Boolean);

          if (addIds.length > 0) {
            const validUsers = await tx.crmUser.findMany({
              where: { id: { in: addIds } },
              select: { id: true },
            });
            if (validUsers.length > 0) {
              await tx.taskWatcher.createMany({
                data: validUsers.map((user) => ({ taskId, userId: user.id })),
                skipDuplicates: true,
              });
            }
          }

          if (removeIds.length > 0) {
            await tx.taskWatcher.deleteMany({
              where: {
                taskId,
                userId: { in: removeIds },
              },
            });
          }
        }

        if (payload.attachments) {
          const addAttachments = payload.attachments.add ?? [];
          if (addAttachments.length > 0) {
            await tx.taskAttachment.createMany({
              data: addAttachments.map((attachment) => ({
                taskId,
                fileName: attachment.fileName,
                fileUrl: attachment.fileUrl,
                uploadedBy: currentUser.id,
              })),
            });
          }

          const removeIds = payload.attachments.removeIds ?? [];
          if (removeIds.length > 0) {
            await tx.taskAttachment.deleteMany({
              where: {
                taskId,
                id: { in: removeIds },
              },
            });
          }
        }

        if (payload.dependencies) {
          if (payload.dependencies.predecessorIds) {
            await tx.taskDependency.deleteMany({ where: { successorId: taskId } });
            const createPredecessors = payload.dependencies.predecessorIds
              .filter((id) => id && id !== taskId)
              .map((predecessorId) => tx.taskDependency.create({
                data: {
                  predecessorId,
                  successorId: taskId,
                  relationType: 'finish_start',
                },
              }));
            await Promise.all(createPredecessors);
          }

          if (payload.dependencies.successorIds) {
            await tx.taskDependency.deleteMany({ where: { predecessorId: taskId } });
            const createSuccessors = payload.dependencies.successorIds
              .filter((id) => id && id !== taskId)
              .map((successorId) => tx.taskDependency.create({
                data: {
                  predecessorId: taskId,
                  successorId,
                  relationType: 'finish_start',
                },
              }));
            await Promise.all(createSuccessors);
          }
        }

        return (await tx.task.update({
          where: { id: taskId },
          data: updateData,
          include: taskFetchArgs.include,
        })) as TaskWithRelations;
      });

      return res.json({ task: mapTaskToResponse(updatedTask) });
    } catch (error) {
      console.error('Error updating task', {
        message: (error as Error)?.message,
        stack: (error as Error)?.stack,
        errorId,
        timestamp,
      });

      return res.status(500).json({
        success: false,
        message: 'Fehler beim Aktualisieren der Aufgabe',
        code: 'TASK_UPDATE_ERROR',
        errorId,
        timestamp,
      });
    }
  });

  app.get('/admin-api/tasks/:id', auth, async (req: AuthRequest, res: Response<TaskResponse | Record<string, unknown>>) => {
    const timestamp = new Date().toISOString();
    const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const taskId = req.params.id;

    try {
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: 'Nicht autorisiert',
          code: 'UNAUTHORIZED',
          errorId,
          timestamp,
        });
      }

      const currentUser = await prisma.crmUser.findUnique({ where: { id: req.user.id } });
      if (!currentUser) {
        return res.status(404).json({
          success: false,
          message: 'Benutzer wurde nicht gefunden',
          code: 'USER_NOT_FOUND',
          errorId,
          timestamp,
        });
      }

      const task = (await prisma.task.findUnique({
        where: { id: taskId },
        include: taskFetchArgs.include,
      })) as TaskWithRelations | null;

      if (!task) {
        return res.status(404).json({
          success: false,
          message: 'Aufgabe wurde nicht gefunden',
          code: 'TASK_NOT_FOUND',
          errorId,
          timestamp,
        });
      }

      const managementView = isManagementRole(currentUser.role);
      if (
        !managementView &&
        task.assignedToId !== currentUser.id &&
        task.createdById !== currentUser.id
      ) {
        return res.status(403).json({
          success: false,
          message: 'Keine Berechtigung für diese Aufgabe',
          code: 'FORBIDDEN',
          errorId,
          timestamp,
        });
      }

      return res.json({ task: mapTaskToResponse(task) });
    } catch (error) {
      console.error('Error fetching task', {
        message: (error as Error)?.message,
        stack: (error as Error)?.stack,
        errorId,
        timestamp,
      });

      return res.status(500).json({
        success: false,
        message: 'Fehler beim Laden der Aufgabe',
        code: 'TASK_FETCH_ERROR',
        errorId,
        timestamp,
      });
    }
  });

  app.delete('/admin-api/tasks/:id', auth, async (req: AuthRequest, res: Response<Record<string, unknown>>) => {
    const timestamp = new Date().toISOString();
    const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const taskId = req.params.id;

    try {
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: 'Nicht autorisiert',
          code: 'UNAUTHORIZED',
          errorId,
          timestamp,
        });
      }

      const currentUser = await prisma.crmUser.findUnique({ where: { id: req.user.id } });
      if (!currentUser) {
        return res.status(404).json({
          success: false,
          message: 'Benutzer wurde nicht gefunden',
          code: 'USER_NOT_FOUND',
          errorId,
          timestamp,
        });
      }

      const existingTask = await prisma.task.findUnique({ where: { id: taskId } });
      if (!existingTask) {
        return res.status(404).json({
          success: false,
          message: 'Aufgabe wurde nicht gefunden',
          code: 'TASK_NOT_FOUND',
          errorId,
          timestamp,
        });
      }

      const managementView = isManagementRole(currentUser.role);
      const canManage =
        managementView ||
        existingTask.assignedToId === currentUser.id ||
        existingTask.createdById === currentUser.id;

      if (!canManage) {
        return res.status(403).json({
          success: false,
          message: 'Keine Berechtigung für diese Aufgabe',
          code: 'FORBIDDEN',
          errorId,
          timestamp,
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.customerInteraction.updateMany({
          where: { followUpTaskId: taskId },
          data: { followUpTaskId: null },
        });
        await tx.task.delete({ where: { id: taskId } });
      });

      return res.json({ success: true, taskId });
    } catch (error) {
      console.error('Error deleting task', {
        message: (error as Error)?.message,
        stack: (error as Error)?.stack,
        errorId,
        timestamp,
      });

      return res.status(500).json({
        success: false,
        message: 'Fehler beim Löschen der Aufgabe',
        code: 'TASK_DELETE_ERROR',
        errorId,
        timestamp,
      });
    }
  });

  app.get('/admin-api/team', auth, async (req: AuthRequest, res) => {
    const timestamp = new Date().toISOString();
    const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    try {
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: 'Nicht autorisiert',
          code: 'UNAUTHORIZED',
          errorId,
          timestamp,
        });
      }

      const currentUser = await prisma.crmUser.findUnique({ where: { id: req.user.id } });
      if (!currentUser) {
        return res.status(404).json({
          success: false,
          message: 'Benutzer wurde nicht gefunden',
          code: 'USER_NOT_FOUND',
          errorId,
          timestamp,
        });
      }

      const users = await prisma.crmUser.findMany({
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      });

      const formatName = (user: typeof users[number]) => {
        const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
        return name || user.email;
      };

      return res.json({
        users: users.map((user) => ({
          ...user,
          name: formatName(user),
        })),
      });
    } catch (error) {
      console.error('Error fetching team members', {
        message: (error as Error)?.message,
        stack: (error as Error)?.stack,
        errorId,
        timestamp,
      });

      return res.status(500).json({
        success: false,
        message: 'Fehler beim Laden der Teamdaten',
        code: 'TEAM_FETCH_ERROR',
        errorId,
        timestamp,
      });
    }
  });

  app.patch('/admin-api/me/password', auth, async (req: AuthRequest, res) => {
    const timestamp = new Date().toISOString();
    const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    try {
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: 'Nicht autorisiert',
          code: 'UNAUTHORIZED',
          errorId,
          timestamp,
        });
      }

      const schema = z
        .object({
          currentPassword: z.string().min(1, 'Aktuelles Passwort ist erforderlich'),
          newPassword: z.string().min(8, 'Neues Passwort muss mindestens 8 Zeichen lang sein'),
        })
        .refine((data) => data.currentPassword !== data.newPassword, {
          message: 'Neues Passwort darf nicht mit dem aktuellen Passwort übereinstimmen',
          path: ['newPassword'],
        });

      const parsed = schema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: 'Ungültige Eingabe',
          code: 'INVALID_INPUT',
          errorId,
          timestamp,
          issues: parsed.error.flatten(),
        });
      }

      const { currentPassword, newPassword } = parsed.data;

      const crmUser = await prisma.crmUser.findUnique({ where: { id: req.user.id } });
      if (!crmUser) {
        return res.status(404).json({
          success: false,
          message: 'Benutzer wurde nicht gefunden',
          code: 'USER_NOT_FOUND',
          errorId,
          timestamp,
        });
      }

      const passwordValid = await verifyPassword(crmUser.passwordHash, currentPassword);
      if (!passwordValid) {
        return res.status(400).json({
          success: false,
          message: 'Aktuelles Passwort ist falsch',
          code: 'INVALID_CURRENT_PASSWORD',
          errorId,
          timestamp,
        });
      }

      await updateUserPassword(crmUser.id, newPassword);

      return res.json({
        success: true,
        message: 'Passwort wurde erfolgreich aktualisiert',
        timestamp,
      });
    } catch (error) {
      console.error('Error updating password', {
        message: (error as Error)?.message,
        stack: (error as Error)?.stack,
        errorId,
        timestamp,
      });

      return res.status(500).json({
        success: false,
        message: 'Passwort konnte nicht aktualisiert werden',
        code: 'PASSWORD_UPDATE_ERROR',
        errorId,
        timestamp,
      });
    }
  });

  app.patch('/admin-api/me/profile-image', auth, async (req: AuthRequest, res) => {
    const timestamp = new Date().toISOString();
    const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    try {
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: 'Nicht autorisiert',
          code: 'UNAUTHORIZED',
          errorId,
          timestamp,
        });
      }

      const schema = z.object({
        image: z
          .string()
          .trim()
          .max(5_000_000, 'Bild ist zu groß (max. 5 MB)')
          .regex(/^data:image\/(png|jpe?g|gif|webp);base64,/i, 'Ungültiges Bildformat')
          .nullable()
          .optional(),
      });

      const parsed = schema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: 'Ungültige Eingabe',
          code: 'INVALID_INPUT',
          errorId,
          timestamp,
          issues: parsed.error.flatten(),
        });
      }

      const image = parsed.data.image ?? null;

      const crmUser = await prisma.crmUser.findUnique({ where: { id: req.user.id } });
      if (!crmUser) {
        return res.status(404).json({
          success: false,
          message: 'Benutzer wurde nicht gefunden',
          code: 'USER_NOT_FOUND',
          errorId,
          timestamp,
        });
      }

      await updateUserProfileImage(crmUser.id, image);

      return res.json({
        success: true,
        message: image ? 'Profilbild wurde aktualisiert' : 'Profilbild wurde entfernt',
        timestamp,
      });
    } catch (error) {
      console.error('Error updating profile image', {
        message: (error as Error)?.message,
        stack: (error as Error)?.stack,
        errorId,
        timestamp,
      });

      return res.status(500).json({
        success: false,
        message: 'Profilbild konnte nicht aktualisiert werden',
        code: 'PROFILE_IMAGE_UPDATE_ERROR',
        errorId,
        timestamp,
      });
    }
  });

  // Get current user
  app.get('/api/auth/me', auth, async (req: AuthRequest, res: Response<MeResponseData>) => {
    const timestamp = new Date().toISOString();
    const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    console.log('Me request received', {
      userId: req.user?.id,
      timestamp,
      headers: req.headers,
      ip: req.ip
    });
    
    try {
      if (!req.user) {
        console.warn('Unauthorized access to /api/auth/me', { 
          timestamp,
          headers: req.headers,
          ip: req.ip
        });
        
        return res.status(401).json({ 
          success: false, 
          message: 'Nicht autorisiert',
          code: 'UNAUTHORIZED',
          errorId,
          timestamp
        });
      }
      
      const dbUser = await prisma.crmUser.findUnique({ where: { id: req.user.id } });

      if (!dbUser) {
        console.warn('Authenticated user not found in database', {
          userId: req.user.id,
          timestamp
        });
        return res.status(404).json({
          success: false,
          message: 'Benutzer wurde nicht gefunden',
          code: 'USER_NOT_FOUND',
          errorId,
          timestamp
        });
      }

      // Log successful response (without sensitive data)
      console.log('Returning user data', {
        userId: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        timestamp
      });
      
      return res.status(200).json({ 
        success: true, 
        user: {
          id: dbUser.id,
          email: dbUser.email,
          firstName: dbUser.firstName ?? null,
          lastName: dbUser.lastName ?? null,
          customerNumber: null,
          role: dbUser.role ?? 'sales_rep',
          salesRepEmail: (dbUser.salesRepEmail ?? dbUser.email)?.toLowerCase() ?? null,
          salesRepId: dbUser.salesRepId ?? null,
          profileImageUrl: dbUser.profileImageUrl ?? null
        }
      });
      
    } catch (error: any) {
      console.error('Error in /api/auth/me:', {
        errorId,
        message: error.message,
        stack: error.stack,
        userId: req.user?.id,
        timestamp
      });
      
      return res.status(500).json({
        success: false,
        message: 'Ein Fehler ist aufgetreten beim Abrufen der Benutzerdaten',
        code: 'ME_ERROR',
        errorId,
        timestamp
      });
    }
  });

  // Socket.IO types are now imported from ./types/socket.types.ts

  // Create HTTP server
  const httpServer = createServer(app);
  
  // Setup Socket.IO with TypeScript types
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });
  
  // Type assertion to our custom type
  const typedIo = io as unknown as CustomSocketIOServer;

  // Socket.IO authentication middleware with proper typing
  io.use(async (socket: CustomSocket, next) => {
    const auth = socket.handshake.auth as SocketAuthData;
    const token = auth.token || 
                 (socket.handshake.headers.authorization || '').split(' ')[1];
    
    if (!token) {
      console.error('Socket connection rejected: No token provided');
      return next(new Error('Authentication error: No token provided'));
    }
    
    try {
      // Verify token and attach user to socket
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as SocketUserData;
      // Initialize socket.data if it doesn't exist
      if (!socket.data) {
        socket.data = { user: null };
      }
      socket.data.user = decoded;
      socket.user = decoded; // Also set on socket.user for backward compatibility
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Socket.IO event interfaces are now defined in ./types/socket.types.ts

  // Socket.IO connection handler with proper typing
  io.on('connection', (socket: CustomSocket) => {
    // Access the user data from socket.data or socket.user
    const user = socket.data?.user || socket.user;
    
    if (user) {
      console.log('New client connected', { 
        userId: user.id,
        email: user.email,
        customerNumber: user.customerNumber,
        role: user.role,
        socketId: socket.id,
        timestamp: new Date().toISOString()
      });
      
      // Handle disconnection
      socket.on('disconnect', (reason) => {
        console.log('Client disconnected', {
          userId: user.id,
          socketId: socket.id,
          reason,
          timestamp: new Date().toISOString()
        });
      });
      
      // Handle errors
      socket.on('error', (error) => {
        console.error('Socket error:', {
          userId: user.id,
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        });
      });
      
      // Example of handling a custom event
      // socket.on('customEvent', (data: CustomEventData) => {
      //   console.log('Received custom event:', { data, userId: user.id });
      //   // Handle the event
      // });
    } else {
      console.warn('Client connected without authentication', {
        socketId: socket.id,
        timestamp: new Date().toISOString()
      });
      
      // Disconnect unauthenticated clients
      socket.disconnect(true);
    }
  });

  // Return both the HTTP server and the typed Socket.IO instance
  return { httpServer, io: typedIo } as const;
}
