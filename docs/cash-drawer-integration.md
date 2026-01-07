# Cash Drawer Integration Guide

## Overview

This guide explains how to integrate and configure cash drawer hardware with your POS system. The system supports various cash drawer models and provides both automatic and manual control options.

## Hardware Requirements

### Supported Cash Drawer Types

1. **Serial Port Cash Drawers**
   - Most common type
   - Connects via RS-232 serial port
   - Standard ESC/POS commands
   - Examples: Star, Epson, Citizen compatible drawers

2. **USB Cash Drawers**
   - Modern USB-connected drawers
   - May require drivers
   - Often plug-and-play

3. **Network Cash Drawers**
   - Ethernet or WiFi connected
   - IP-based communication
   - Advanced features and monitoring

### Hardware Setup

1. **Physical Connection**
   - Connect cash drawer to computer via appropriate cable
   - Ensure proper power supply
   - Check for any physical locks or security features

2. **Driver Installation**
   - Install manufacturer drivers if required
   - Test basic connectivity
   - Note the COM port number (for serial drawers)

## Software Configuration

### 1. Enable Cash Drawer

1. Navigate to **Settings → System → Cash Drawer Configuration**
2. Toggle "Enable Cash Drawer" to ON
3. Configure the following settings:

### 2. Port Configuration

- **Port**: Enter the COM port (e.g., COM1, COM2, COM3)
- **Baud Rate**: Select the appropriate baud rate (typically 9600)

### 3. Behavior Settings

- **Auto-Open on Cash Payment**: Automatically opens drawer when cash payment is processed
- **Require Confirmation**: Shows confirmation dialog before opening
- **Sound Notification**: Plays sound when drawer opens

### 4. Testing

Use the built-in test functions:

- **Test Connection**: Verifies hardware connectivity
- **Open Drawer**: Manually opens the drawer

## Integration Points

### 1. POS Payment Processing

The system automatically integrates with payment processing:

```typescript
// When cash payment is processed
if (paymentMethod === "cash" && settings.cashDrawer.enabled) {
  await openCashDrawer(settings.cashDrawer);
}
```

### 2. Manual Controls

Access manual controls through:

- **Settings Page**: Test and configure
- **Cash Drawer Manager Component**: Real-time monitoring
- **POS Interface**: Quick access buttons

## Troubleshooting

### Common Issues

1. **Drawer Not Opening**
   - Check physical connection
   - Verify COM port settings
   - Test with manufacturer software
   - Check for hardware locks

2. **Connection Errors**
   - Verify port is not in use by other applications
   - Check baud rate compatibility
   - Restart the application
   - Try different COM ports

3. **Permission Issues**
   - Run application as administrator
   - Check Windows device permissions
   - Verify USB device access

### Diagnostic Steps

1. **Hardware Test**

   ```bash
   # Windows: Check Device Manager
   # Look for COM ports or USB devices
   ```

2. **Software Test**
   - Use manufacturer's test software
   - Check Windows Event Viewer for errors
   - Test with simple serial communication tools

3. **Application Test**
   - Use built-in test functions
   - Check browser console for errors
   - Verify settings are saved correctly

## Advanced Configuration

### Custom Commands

For non-standard cash drawers, you can modify the open command in `lib/cash-drawer.ts`:

```typescript
// Standard ESC/POS command
const openCommand = Buffer.from([0x1b, 0x70, 0x00, 0x00, 0x00]);

// Alternative commands for different models
// Some drawers use different command sequences
```

### Network Configuration

For network-based cash drawers:

```typescript
// Add network configuration to settings
interface CashDrawerConfig {
  // ... existing fields
  network?: {
    host: string;
    port: number;
    protocol: "tcp" | "udp";
  };
}
```

### Security Considerations

1. **Access Control**
   - Restrict drawer access to authorized users
   - Log all drawer operations
   - Implement audit trails

2. **Physical Security**
   - Secure drawer location
   - Implement time-based restrictions
   - Monitor for unusual activity

## API Reference

### CashDrawerService

```typescript
class CashDrawerService {
  // Connect to cash drawer
  async connect(): Promise<boolean>;

  // Open the drawer
  async open(): Promise<boolean>;

  // Close the drawer (if supported)
  async close(): Promise<boolean>;

  // Test connection
  async test(): Promise<boolean>;

  // Get current status
  getStatus(): CashDrawerStatus;

  // Subscribe to status changes
  onStatusChange(callback): () => void;
}
```

### Utility Functions

```typescript
// Open drawer with configuration
openCashDrawer(config: CashDrawerConfig): Promise<boolean>

// Test drawer functionality
testCashDrawer(config: CashDrawerConfig): Promise<boolean>

// Get service instance
getCashDrawerService(config?: CashDrawerConfig): CashDrawerService
```

## Best Practices

1. **Configuration**
   - Always test after configuration changes
   - Keep backup of working settings
   - Document hardware specifications

2. **Maintenance**
   - Regular hardware inspection
   - Clean connections periodically
   - Update drivers when available

3. **Monitoring**
   - Monitor drawer usage patterns
   - Check for error logs regularly
   - Implement health checks

4. **Training**
   - Train staff on proper usage
   - Document emergency procedures
   - Provide troubleshooting guides

## Support

For additional support:

1. **Hardware Issues**: Contact cash drawer manufacturer
2. **Software Issues**: Check system logs and documentation
3. **Integration Issues**: Review configuration and test procedures

## Future Enhancements

Planned features for future releases:

1. **Multi-Drawer Support**: Support for multiple cash drawers
2. **Advanced Monitoring**: Real-time status dashboard
3. **Integration APIs**: REST API for external systems
4. **Mobile Support**: Remote drawer control via mobile app
5. **Analytics**: Usage statistics and reporting
