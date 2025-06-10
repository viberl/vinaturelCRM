import { customers, interactions, type Customer, type InsertCustomer, type Interaction, type InsertInteraction } from "@shared/schema";

export interface IStorage {
  // Customer methods
  getCustomers(): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, customer: Partial<InsertCustomer>): Promise<Customer | undefined>;
  
  // Interaction methods
  getInteractions(customerId?: number): Promise<Interaction[]>;
  getInteraction(id: number): Promise<Interaction | undefined>;
  createInteraction(interaction: InsertInteraction): Promise<Interaction>;
}

export class MemStorage implements IStorage {
  private customers: Map<number, Customer>;
  private interactions: Map<number, Interaction>;
  private customerIdCounter: number;
  private interactionIdCounter: number;

  constructor() {
    this.customers = new Map();
    this.interactions = new Map();
    this.customerIdCounter = 1;
    this.interactionIdCounter = 1;
    
    // Initialize with sample data
    this.initializeSampleData();
  }

  private initializeSampleData() {
    const sampleCustomers: Omit<Customer, 'id' | 'createdAt'>[] = [
      {
        name: 'Weingut Müller GmbH',
        email: 'info@weingut-mueller.de',
        phone: '+49 6131 123456',
        address: 'Weinstraße 15, 55218 Ingelheim',
        lat: '49.97250000',
        lng: '8.06440000',
        status: 'active',
        totalRevenue: '45890.00',
        orderCount: 47,
        lastContact: '2 Tage',
        memberSince: 'Jan 2019',
        discountLevel: 'Premium'
      },
      {
        name: 'Restaurant Zur Traube',
        email: 'bestellung@zur-traube.de',
        phone: '+49 6131 789012',
        address: 'Marktplatz 8, 55116 Mainz',
        lat: '50.00120000',
        lng: '8.27110000',
        status: 'potential',
        totalRevenue: '12400.00',
        orderCount: 12,
        lastContact: '1 Woche',
        memberSince: 'Mar 2022',
        discountLevel: 'Standard'
      },
      {
        name: 'Vinothek Rheinhessen',
        email: 'info@vinothek-rheinhessen.de',
        phone: '+49 6132 456789',
        address: 'Rheinstraße 42, 55283 Nierstein',
        lat: '49.86440000',
        lng: '8.34560000',
        status: 'active',
        totalRevenue: '78350.00',
        orderCount: 89,
        lastContact: '3 Tage',
        memberSince: 'Sep 2018',
        discountLevel: 'Premium'
      }
    ];

    sampleCustomers.forEach(customer => {
      const id = this.customerIdCounter++;
      this.customers.set(id, {
        ...customer,
        id,
        createdAt: new Date()
      });
    });

    // Add sample interactions
    const sampleInteractions: Omit<Interaction, 'id' | 'createdAt'>[] = [
      {
        customerId: 1,
        type: 'phone',
        title: 'Telefonat - Bestellungsabwicklung',
        description: 'Kunde hat Nachfrage zu neuen Weinsorten gestellt. Folgebestellung für Q2 geplant.',
        duration: '15 Min',
        status: 'completed',
        attachments: 0
      },
      {
        customerId: 1,
        type: 'email',
        title: 'E-Mail - Produktkatalog gesendet',
        description: 'Neuer Produktkatalog für Frühjahr 2024 übermittelt. Kunde zeigt Interesse an Bio-Weinen.',
        duration: null,
        status: 'completed',
        attachments: 1
      },
      {
        customerId: 1,
        type: 'meeting',
        title: 'Termin - Weinprobe vor Ort',
        description: 'Geplanter Besuch für Weinprobe und Besprechung der Frühjahrsbestellung.',
        duration: null,
        status: 'planned',
        attachments: 0
      }
    ];

    sampleInteractions.forEach(interaction => {
      const id = this.interactionIdCounter++;
      this.interactions.set(id, {
        ...interaction,
        id,
        createdAt: new Date()
      });
    });
  }

  async getCustomers(): Promise<Customer[]> {
    return Array.from(this.customers.values());
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    return this.customers.get(id);
  }

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const id = this.customerIdCounter++;
    const customer: Customer = {
      ...insertCustomer,
      id,
      createdAt: new Date()
    };
    this.customers.set(id, customer);
    return customer;
  }

  async updateCustomer(id: number, updates: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const customer = this.customers.get(id);
    if (!customer) return undefined;

    const updatedCustomer = { ...customer, ...updates };
    this.customers.set(id, updatedCustomer);
    return updatedCustomer;
  }

  async getInteractions(customerId?: number): Promise<Interaction[]> {
    const interactions = Array.from(this.interactions.values());
    if (customerId) {
      return interactions.filter(i => i.customerId === customerId);
    }
    return interactions;
  }

  async getInteraction(id: number): Promise<Interaction | undefined> {
    return this.interactions.get(id);
  }

  async createInteraction(insertInteraction: InsertInteraction): Promise<Interaction> {
    const id = this.interactionIdCounter++;
    const interaction: Interaction = {
      ...insertInteraction,
      id,
      createdAt: new Date()
    };
    this.interactions.set(id, interaction);
    return interaction;
  }
}

export const storage = new MemStorage();
