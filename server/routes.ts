import { Express, Request, Response, NextFunction, json } from "express";
import { createServer, Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket, DefaultEventsMap } from "socket.io";
import type { Server as SocketIOServerType } from 'socket.io';
import cors from "cors";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import prisma from "./prismaClient";
import { adminSearch } from "./shopwareAdmin";
import {
  Prisma,
  type CustomerInteraction as PrismaCustomerInteraction,
  type Task as PrismaTask,
  type TaskDependency as PrismaTaskDependency,
} from "@prisma/client";
import { z } from "zod";
import { findUserByEmail, verifyPassword } from "./userService";
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
  crmUser: { salesRepId?: string | null; salesRepEmail?: string | null }
): boolean {
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

function toStringOrNull(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const result = String(value).trim();
  return result.length > 0 ? result : null;
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
      salesRepEmail: crmUser.salesRepEmail
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
    };
    message?: string;
    code?: string;
    errorId?: string;
    timestamp?: string;
  }

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
          salesRepId: crmUser.salesRepId
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
          salesRepId: crmUser.salesRepId
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
        salesRepEmail: crmUser.salesRepEmail
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
        salesRepEmail: crmUser.salesRepEmail
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
            limit: chunk.length * 50,
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
        return mapShopwareOrder(order, preparedLineItems);
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
        salesRepEmail: crmUser.salesRepEmail
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
        salesRepEmail: crmUser.salesRepEmail
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
          salesRepId: dbUser.salesRepId ?? null
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
