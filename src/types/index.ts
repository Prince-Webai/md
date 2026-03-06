
export interface Customer {
    id: string;
    created_at: string;
    name: string;
    address?: string; // Legacy
    address_line1?: string;
    contact_person?: string;
    email?: string;
    phone?: string;
    account_balance?: number;
    payment_terms?: string;
}

export interface InventoryItem {
    id: string;
    created_at: string;
    sku: string;
    name: string;
    category?: string;
    description?: string;
    cost_price: number;
    sell_price: number;
    stock_level: number;
    low_stock_threshold?: number;
    location?: string;
}

export interface Job {
    id: string;
    created_at: string;
    job_number: number;
    customer_id: string;
    machine_details?: string;
    problem_description?: string;
    status: 'Booked In' | 'In Progress' | 'Waiting for Parts' | 'Ready to Continue' | 'Ready for Collection' | 'Completed' | 'Closed';
    mechanic_id?: string;
    date_scheduled?: string;
    date_completed?: string;

    // React specific legacy fields that we alias out inside createJob:
    service_type?: string;
    engineer_name?: string;
    notes?: string;

    // Timer fields
    timer_status?: 'stopped' | 'running' | 'paused';
    timer_started_at?: string;
    actual_start_time?: string;
    actual_end_time?: string;
    total_hours_worked?: number;

    // Pipeline fields
    priority?: 'Normal' | 'Urgent' | 'Overdue';

    // Report fields
    recommendations?: string;
    mechanic_sign_off_name?: string;
    job_sheet_pdf_url?: string;
    completion_report_pdf_url?: string;

    // Joins
    customers?: Customer;
    job_items?: JobItem[];
}

export interface JobItem {
    id: string;
    job_id: string;
    inventory_id?: string;
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
    type: 'part' | 'labor' | 'service';
    // Joins
    inventory?: InventoryItem;
    jobs?: Job;
}

export interface Invoice {
    id: string;
    created_at: string;
    invoice_number: string;
    customer_id: string;
    job_id?: string;
    date_issued: string;
    due_date?: string;
    subtotal: number;
    vat_rate?: number;
    vat_amount: number;
    total_amount: number;
    custom_description?: string;
    status: 'draft' | 'sent' | 'paid' | 'void' | 'partial' | 'overdue';
    pdf_url?: string;
    sent_count?: number;
    guest_name?: string; // For one-time invoices
    amount_paid?: number;
    payment_date?: string;
    customers?: Customer;
    invoice_items?: InvoiceItem[];
}

export interface InvoiceItem {
    id: string;
    invoice_id: string;
    inventory_id?: string;
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
    type: 'part' | 'labor' | 'service';
}

export interface Statement {
    id: string;
    created_at: string;
    statement_number: string;
    customer_id: string;
    job_id?: string;
    date_generated: string;
    total_amount: number;
    pdf_url?: string;
    // Joins
    customers?: Customer;
    jobs?: Job;
}

export interface Quote {
    id: string;
    created_at: string;
    quote_number: string;
    customer_id: string;
    description: string;
    date_issued: string;
    valid_until?: string;
    subtotal: number;
    vat_rate?: number;
    vat_amount: number;
    total_amount: number;
    status: 'draft' | 'pending' | 'accepted' | 'rejected';
    notes?: string;
    // Joins
    customers?: Customer;
    quote_items?: QuoteItem[];
}

export interface QuoteItem {
    id: string;
    quote_id: string;
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
}
export interface Settings {
    id: string;
    company_name: string;
    company_address: string;
    company_phone: string;
    company_email: string;
    contact_name: string;
    bank_name: string;
    account_name: string;
    iban: string;
    bic: string;
    vat_reg_number: string;
    webhook_url: string;
    company_logo_url?: string;
    updated_at: string;
}
