# Thermal Printer Integration Guide

## Overview

This guide explains how to integrate and configure thermal printer hardware with your POS system. The system supports various thermal printer types and provides comprehensive testing and configuration tools.

## Features

### Core Functionality

- **Hardware Integration**: Support for USB, Serial, and Network thermal printers
- **Real-time Printing**: Instant receipt printing and text output
- **Configuration Management**: Comprehensive settings for all printer types
- **Testing Tools**: Built-in connection and functionality testing
- **Receipt Formatting**: Professional receipt layout with logo and barcodes
- **Audio/Visual Feedback**: Sound notifications and status monitoring
- **Print Queue Management**: Queue management for multiple print jobs

### Supported Printer Types

- **USB Thermal Printers**: Most common, plug-and-play
- **Serial Thermal Printers**: RS-232 connection, configurable
- **Network Thermal Printers**: Ethernet/WiFi connection
- **ESC/POS Compatible**: Industry standard command set

## Hardware Requirements

### Supported Printer Types

1. **USB Thermal Printers**
   - Most common and easiest to configure
   - Plug-and-play functionality
   - ESC/POS command support
   - Examples: Star, Epson, Citizen, Bixolon

2. **Serial Thermal Printers**
   - RS-232 connection
   - Requires port configuration
   - More reliable for industrial use
   - Examples: Star, Epson, Citizen

3. **Network Thermal Printers**
   - Ethernet or WiFi connection
   - IP-based communication
   - Advanced features and monitoring
   - Examples: Star, Epson, Bixolon

### Hardware Setup

1. **Physical Connection**
   - Connect printer to computer via appropriate cable
   - Ensure proper power supply
   - Check for any physical switches or settings

2. **Driver Installation**
   - Install manufacturer drivers if required
   - Test basic connectivity
   - Note the COM port number (for serial printers)

## Software Configuration

### 1. Enable Thermal Printer

1. Navigate to **Settings → System → Thermal Printer Configuration**
2. Toggle "Enable Thermal Printer" to ON
3. Configure the following settings:

### 2. Hardware Configuration

#### Port Settings (Serial Printers)

- **Port**: Enter the COM port (e.g., COM1, COM2, COM3)
- **Baud Rate**: Select the appropriate baud rate (typically 9600)
- **Data Bits**: Choose 7 or 8 data bits (typically 8)
- **Stop Bits**: Choose 1 or 2 stop bits (typically 1)
- **Parity**: Select None, Even, or Odd (typically None)

#### Paper Settings

- **Paper Width**: Select 58mm or 80mm paper width
- **Print Density**: Choose print darkness (0-8, typically 8)
- **Print Speed**: Choose print speed (5-10, typically 10)

#### Font Settings

- **Font Size**: Select font size (10-16, typically 12)
- **Alignment**: Choose text alignment (left, center, right)
- **Character Set**: Select character encoding (typically 1252)

### 3. Behavior Settings

- **Auto Cut**: Automatically cut paper after printing
- **Sound Notification**: Play sound when printing completes
- **Include Logo**: Include restaurant logo on receipts
- **Include Barcodes**: Include barcode information on receipts
- **Include Footer**: Include footer message on receipts

## Testing and Troubleshooting

### 1. Built-in Test Tools

Access the comprehensive test interface at `/thermal-test`:

#### Connection Testing

- **Test Connection**: Verifies hardware connectivity
- **Configure Printer**: Applies configuration settings
- **Reconnect**: Re-establishes connection

#### Printing Testing

- **Test Print Text**: Print custom text content
- **Test Receipt**: Print formatted test receipt
- **Real-time Monitoring**: View printer status and diagnostics
- **Print Queue**: Manage print jobs

### 2. Status Indicators

The system provides real-time status information:

- **Connection Status**: Connected/Disconnected
- **Printer Status**: Ready/Printing
- **Last Printed**: Most recent print job and timestamp
- **Paper Status**: OK/Low/Empty/Unknown
- **Temperature**: Print head temperature
- **Print Head Status**: OK/Hot/Error/Unknown

### 3. Common Issues and Solutions

#### Printer Not Detected

**Symptoms**: Connection status shows "Disconnected"
**Solutions**:

- Check physical USB connection
- Verify device appears in Device Manager
- Install manufacturer drivers
- Try different USB port

#### Wrong Port Settings

**Symptoms**: Connection fails or data is corrupted
**Solutions**:

- Verify COM port number in Device Manager
- Check baud rate compatibility
- Test different parity/stop bit combinations
- Use manufacturer's test software

#### No Paper Output

**Symptoms**: Printer connected but no paper output
**Solutions**:

- Check paper feed mechanism
- Verify paper is loaded correctly
- Check print head status
- Test with manufacturer's test software

#### Poor Print Quality

**Symptoms**: Faded or unclear text
**Solutions**:

- Adjust print density settings
- Clean print head
- Check paper quality
- Verify print speed settings

## Integration Points

### 1. POS System Integration

The thermal printer automatically integrates with the POS system:

```typescript
// When payment is completed
const receiptData = {
  orderNumber: "ORD-001",
  date: new Date().toLocaleDateString(),
  time: new Date().toLocaleTimeString(),
  items: orderItems,
  subtotal: 50.0,
  tax: 6.25,
  total: 56.25,
  paymentMethod: "cash",
  customerName: "John Doe",
  orderType: "dine-in",
  tableNumber: "5",
};

await printReceipt(receiptData, settings.system.thermalPrinter);
```

### 2. Receipt Formatting

The system generates professional receipts with:

- Restaurant logo and branding
- Order details and items
- Pricing and totals
- Payment information
- Barcode data (if enabled)
- Footer message (if enabled)

### 3. Print Queue Management

The system manages print jobs with:

- Queue processing
- Job status tracking
- Error handling
- Priority management

## Advanced Configuration

### 1. Custom Receipt Templates

For custom receipt formats, you can modify the template in `lib/thermal-printer.ts`:

```typescript
private generateReceiptContent(receiptData: ReceiptData): string {
  // Customize receipt layout here
  const lines: string[] = [];

  // Add custom header
  lines.push("CUSTOM RESTAURANT HEADER");

  // Add custom content
  // ... custom formatting logic

  return lines.join('\n');
}
```

### 2. ESC/POS Commands

For advanced printer control, you can add custom ESC/POS commands:

```typescript
// Custom printer commands
const commands = {
  cut: Buffer.from([0x1d, 0x56, 0x00]),
  bold: Buffer.from([0x1b, 0x45, 0x01]),
  normal: Buffer.from([0x1b, 0x45, 0x00]),
  alignCenter: Buffer.from([0x1b, 0x61, 0x01]),
  alignLeft: Buffer.from([0x1b, 0x61, 0x00]),
};
```

### 3. Network Configuration

For network-based printers:

```typescript
interface ThermalPrinterConfig {
  // ... existing fields
  network?: {
    host: string;
    port: number;
    protocol: "tcp" | "udp";
  };
}
```

## Security Considerations

### 1. Print Job Validation

- All print jobs are validated before processing
- Malicious content is filtered out
- Print job size limits are enforced

### 2. Access Control

- Thermal printer configuration requires admin privileges
- Test functions are restricted to authorized users
- Print history is logged for audit purposes

### 3. Data Protection

- Receipt data is not stored permanently
- Sensitive information is not logged
- Temporary data is cleared after processing

## Best Practices

### 1. Hardware Setup

- Use high-quality, reliable thermal printers
- Keep printers clean and well-maintained
- Have backup printers available
- Test printers regularly

### 2. Configuration

- Document all configuration settings
- Use consistent settings across multiple printers
- Test configuration changes thoroughly
- Keep configuration backups

### 3. Testing

- Test printers before each shift
- Verify print quality and alignment
- Check paper feed mechanism
- Monitor printer performance

### 4. Maintenance

- Clean print heads regularly
- Update printer firmware when available
- Replace worn or damaged printers
- Keep spare parts on hand

## Troubleshooting Checklist

### Connection Issues

- [ ] Physical connection secure
- [ ] Device appears in Device Manager
- [ ] Correct COM port selected
- [ ] Baud rate matches printer
- [ ] No other applications using port

### Printing Issues

- [ ] Printer powered on
- [ ] Paper loaded correctly
- [ ] Print head clean
- [ ] Print density appropriate
- [ ] Sound/vibration enabled for feedback

### Quality Issues

- [ ] Print density configured correctly
- [ ] Print speed appropriate
- [ ] Paper quality good
- [ ] Print head not worn
- [ ] Printer settings match paper type

## Support and Resources

### Documentation

- This guide provides comprehensive setup instructions
- Manufacturer documentation for specific printer models
- Online troubleshooting resources

### Testing Tools

- Built-in test interface at `/thermal-test`
- Manufacturer test software
- Third-party printer testing tools

### Contact Information

- Technical support for hardware issues
- Software support for configuration problems
- Training resources for staff

## Conclusion

The thermal printer integration provides a robust, reliable solution for receipt printing in your POS system. With proper configuration and regular testing, thermal printing can significantly improve customer experience and operational efficiency in your restaurant.

For additional support or questions, refer to the troubleshooting section or contact technical support.
