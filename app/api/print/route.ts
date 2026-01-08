import { NextResponse } from "next/server";
import {
  ThermalPrinter,
  PrinterTypes,
  CharacterSet,
} from "node-thermal-printer";
import { PrinterConfig } from "@/lib/settings";
import { ReceiptData } from "@/lib/types";

// Helper to print receipt content
async function generateReceipt(
  printer: ThermalPrinter,
  data: ReceiptData,
  config: PrinterConfig
) {
  // Reset formatting
  printer.alignCenter();

  // Logo (if supported and configured)
  // Note: Printing images requires passing a buffer or path, which is complex here.
  // We'll skip actual image printing for this implementation but keep the logic structure.

  // Header
  if (config.name) {
    printer.println(config.name);
  }

  // Use business info from receipt data if available, otherwise fallback
  const businessName = data.businessName || "Kumbisaly Heritage Restaurant";
  printer.println(businessName);

  printer.println(data.businessAddress || "Offinso - Abofour, Ashanti, Ghana");
  printer.println(`Tel: ${data.businessPhone || "0535975442"}`);
  printer.println(
    data.businessEmail || "info.kumbisalyheritagehotel@gmail.com"
  );

  printer.newLine();

  // Order Info
  printer.alignLeft();
  printer.println(`Order #: ${data.orderNumber}`);
  printer.println(`Date: ${data.date} ${data.time}`);
  if (data.tableNumber) printer.println(`Table: ${data.tableNumber}`);
  if (data.customerName) printer.println(`Customer: ${data.customerName}`);
  if (data.orderType) printer.println(`Type: ${data.orderType}`);
  printer.newLine();

  // Items
  printer.tableCustom([
    { text: "Item", align: "LEFT", width: 0.5 },
    { text: "Qty", align: "CENTER", width: 0.15 },
    { text: "Price", align: "RIGHT", width: 0.35 },
  ]);
  printer.drawLine();

  data.items.forEach((item) => {
    printer.tableCustom([
      { text: item.name, align: "LEFT", width: 0.5 },
      { text: item.quantity.toString(), align: "CENTER", width: 0.15 },
      { text: item.total.toFixed(2), align: "RIGHT", width: 0.35 },
    ]);
  });
  printer.drawLine();

  // Totals
  printer.alignRight();
  printer.println(`Subtotal: ${data.subtotal.toFixed(2)}`);
  printer.println(`Tax: ${data.tax.toFixed(2)}`);
  printer.bold(true);
  printer.println(`TOTAL: ${data.total.toFixed(2)}`);
  printer.bold(false);
  printer.newLine();

  // Footer
  if (config.includeFooter) {
    printer.alignCenter();
    printer.println(config.footerText || "Thank you for your business!");
    printer.println("Please come again.");
  }

  // Cut
  if (config.autoCut) {
    printer.cut();
  }

  // Sound
  if (config.soundEnabled) {
    printer.beep();
  }

  try {
    return await printer.execute();
  } catch (error) {
    console.error("Printer execution failed:", error);
    throw error;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { receipt, configs } = body as {
      receipt: ReceiptData;
      configs: PrinterConfig[];
    };

    if (!receipt || !configs || !Array.isArray(configs)) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const results = await Promise.allSettled(
      configs.map(async (config) => {
        if (!config.enabled) return { status: "skipped", name: config.name };

        // Determine interface and options
        // node-thermal-printer types: interface can be string, but specifically specific strings
        // "tcp" | "printer" | "file" | "serial" | "bluetooth" ...

        let printerInterface: string = config.interfaceType;

        if (config.interfaceType === "tcp") {
          if (!config.ip) {
            throw new Error(
              `Printer ${config.name} is configured for TCP but missing IP address.`
            );
          }
          printerInterface = `tcp://${config.ip}:${config.port || 9100}`;
        } else if (config.interfaceType === "serial") {
          // e.g. "COM1"
          printerInterface = `serial://${config.port}`; // Format depends on library version/OS
          // For node-thermal-printer v4, it might pass interface directly to driver
          // But usually for Serial we might need to handle it differently or assume it's a system printer path
          // For simplicity and safety in this environment, we treat it as a potential "printer" type if it's a system printer name
          // Or if it's strictly serial, we'd pass config.
        }

        // Note: Direct hardware access (USB/Serial) from Next.js API route (Serverless/Edge)
        // is often restricted or impossible if not running locally.
        // TCP is the safest bet for network printing.

        const printer = new ThermalPrinter({
          type: PrinterTypes.EPSON, // Default to Epson, could be configurable
          interface: printerInterface,
          characterSet:
            (config.characterSet as CharacterSet) ||
            CharacterSet.PC850_MULTILINGUAL,
          removeSpecialCharacters: false,
          lineCharacter: "=",
          options: {
            timeout: 5000, // 5 second timeout
          },
          width: config.paperWidth === 80 ? 42 : 32, // Approximate chars per line
        });

        // Verify connection (if possible/supported by library for the interface)
        const isConnected = await printer.isPrinterConnected();
        if (!isConnected) {
          // For TCP, this check is valuable. For others, it might always return true or false depending on driver.
          // If we can't connect, we might want to throw or log.
          // However, let's try to print anyway as check might be flaky.
          console.warn(
            `Printer ${config.name} (${printerInterface}) reported as not connected.`
          );
        }

        await generateReceipt(printer, receipt, config);
        return { status: "printed", name: config.name };
      })
    );

    // Process results
    const details = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return {
        status: "failed",
        name: configs[i].name,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      };
    });

    // If at least one printer worked (or was skipped), we consider it partial success?
    // Or if all failed, we return 500.
    // For now, return 200 with details so client can show warnings.

    return NextResponse.json({
      success: true, // overall request processed
      results: details,
    });
  } catch (error) {
    console.error("Print API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: String(error) },
      { status: 500 }
    );
  }
}
