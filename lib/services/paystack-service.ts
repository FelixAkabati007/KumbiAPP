export interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    id: number;
    status: string;
    reference: string;
    amount: number;
    gateway_response: string;
    channel: string;
    currency: string;
    customer: {
      email: string;
      customer_code: string;
    };
    metadata?: Record<string, unknown>;
  };
}

export class PaystackService {
  private secretKey: string;
  private baseUrl = "https://api.paystack.co";

  constructor() {
    this.secretKey = process.env.PAYSTACK_SECRET_KEY || "";
    if (!this.secretKey) {
      console.warn("PAYSTACK_SECRET_KEY is not set");
    }
  }

  /**
   * Initialize a transaction
   * @param email Customer email
   * @param amount Amount in GHS (will be converted to pesewas)
   * @param metadata Optional metadata
   */
  async initializeTransaction(
    email: string,
    amount: number,
    metadata?: Record<string, unknown>,
  ): Promise<PaystackInitializeResponse> {
    const params = {
      email,
      amount: Math.round(amount * 100), // Convert to pesewas
      currency: "GHS",
      metadata,
      channels: ["mobile_money", "card"], // Limit to MoMo and Card
    };

    const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Paystack initialization failed: ${errorText}`);
    }

    return response.json();
  }

  /**
   * Verify a transaction
   * @param reference Transaction reference
   */
  async verifyTransaction(reference: string): Promise<PaystackVerifyResponse> {
    const response = await fetch(
      `${this.baseUrl}/transaction/verify/${reference}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Paystack verification failed: ${errorText}`);
    }

    return response.json();
  }

  /**
   * Refund a transaction
   * @param reference Transaction reference
   * @param amount Optional amount to refund (if partial). If not provided, full amount is refunded.
   */
  async refundTransaction(
    reference: string,
    amount?: number,
  ): Promise<Record<string, unknown>> {
    const params: { transaction: string; amount?: number } = {
      transaction: reference,
    };
    if (amount) {
      params.amount = Math.round(amount * 100); // Convert to pesewas
    }

    const response = await fetch(`${this.baseUrl}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Paystack refund failed: ${errorText}`);
    }

    return response.json();
  }
}
