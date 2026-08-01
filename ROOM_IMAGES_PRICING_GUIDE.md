# Room Images & Per-Room Pricing Guide

## Overview
The hotel management system now supports individual room pricing and image galleries. Admins and Managers can upload multiple images for each room and set specific prices independent of room type pricing.

## Quick Start

### Adding a New Room with Images and Price

1. **Click "Add Room"** button in the Rooms section
2. **Fill in basic details**:
   - Room Number (required)
   - Floor and Building (optional)
   - Room Type (required)
   - Notes (optional)
3. **Enter Price** (required):
   - Input the price in Ghana Cedis (GHS)
   - This price applies to this specific room only
   - Even if room type has a base price, this per-room price will be used
4. **Add Images**:
   - **Option A - Upload from Computer**:
     - Click or drag images into the upload area
     - Maximum 5MB per image
     - Recommended size: 800x600px or larger
   - **Option B - Paste Image URL**:
     - Enter a direct image URL (e.g., from Unsplash, Pinterest, etc.)
     - Click "Add URL" button
     - URL will be added to the gallery
5. **Review** the image previews in the gallery
6. **Remove images** if needed by hovering and clicking the X button
7. **Click "Add Room"** to save

### Editing an Existing Room

1. **Click "Edit"** on any room in the table
2. Update any fields:
   - Price (to change per-room pricing)
   - Images (add new images or remove existing ones)
3. **Click "Update Room"** to save changes

### Viewing Rooms

The **Room List** table displays:
- **Image Column**: Primary room image (first image) or placeholder
- **Price Column**: Shows the per-room price in GHS format
- Shows room number, type, building, floor, and status
- Edit button to modify any room

## Pricing

### How Pricing Works

**Per-Room Pricing (New)**
- Each room can have its own individual price
- Price is set when adding or editing a room
- This price overrides the room type base price

**Room Type Pricing (Legacy)**
- If a room doesn't have a per-room price set, it uses the room type base price:
  - Standard Room: GHS 250
  - Deluxe Room: GHS 450
  - Suite: GHS 750

### Example Scenarios

**Scenario 1: Standard Room with Custom Price**
- Room Type: Standard (default GHS 250)
- Room Price: GHS 300 (custom)
- **Displayed Price: GHS 300** ✓

**Scenario 2: Suite with Seasonal Pricing**
- Room Type: Suite (default GHS 750)
- Room Price: GHS 950 (peak season)
- **Displayed Price: GHS 950** ✓

**Scenario 3: Premium Standard Room**
- Room Type: Standard (default GHS 250)
- Room Price: GHS 350 (better location)
- **Displayed Price: GHS 350** ✓

## Images

### Uploading Images

**From Computer**
- Click or drag files into the upload area
- Multiple files can be selected at once
- Each file is uploaded to cloud storage
- Supported formats: JPG, PNG, GIF, WebP

**From URL**
- Paste any public image URL
- Click "Add URL" button
- Image will be added to the room's gallery
- Useful for images already on the web

### Image Requirements

- **Minimum**: 1 image recommended
- **Maximum**: 10 images per room (recommended limit)
- **Size**: 800x600px or larger for best quality
- **File Size**: Maximum 5MB per file (when uploading)
- **Format**: JPEG, PNG, GIF, or WebP

### Image Management

**View Images**
- Thumbnails appear in a 3-column grid
- Hover over thumbnail to see options

**Delete Image**
- Hover over any image
- Click the X button in the corner
- Image will be removed from the room

**Primary Image**
- First image uploaded becomes the primary
- Primary image shows in the room list table
- Can be changed by deleting and re-uploading

## Best Practices

### For Adding Images

1. **Lighting**: Use well-lit photos of the room
2. **Angles**: Show multiple perspectives:
   - Overall room view
   - Bed/sleeping area
   - Bathroom/amenities
   - Window view/outdoor area
   - Special features (if any)
3. **Resolution**: Use high-quality images (800x600px minimum)
4. **Consistency**: Keep similar lighting and style across images
5. **Real Photos**: Use actual room photos, not stock images (when possible)
6. **Order**: Put best photos first (they'll be primary/featured)

### For Setting Prices

1. **Research**: Check competitor pricing for similar room types
2. **Consistency**: Be consistent within room type categories
3. **Location**: Consider room location (corner, high floor, etc.)
4. **Features**: Price higher for rooms with premium features
5. **Updates**: Adjust prices seasonally if needed
6. **Clear Pricing**: Use round numbers or standard increments

### Examples of Good Room Prices

| Room Type | Base | Budget | Standard | Premium |
|-----------|------|--------|----------|---------|
| Standard  | 250  | 200    | 250-300  | 350     |
| Deluxe    | 450  | 400    | 450-500  | 600     |
| Suite     | 750  | 700    | 750-850  | 1000+   |

## Troubleshooting

### Image Upload Issues

**"File size must be less than 5MB"**
- Your image file is too large
- Compress the image using an online tool or image editor
- Try uploading in a different format (JPG instead of PNG)

**"File must be an image"**
- You selected a non-image file (PDF, video, etc.)
- Only image files are supported (JPG, PNG, GIF, WebP)

**"Upload failed"**
- Check your internet connection
- Try again in a few moments
- Try a different image file

### Form Issues

**"Please fill in all required fields"**
- Make sure you filled in:
  - Room Number
  - Room Type
  - Price (GHS)

**Images not showing in list**
- Database migration may not have run
- Contact admin to run: `migrations/add_room_images_and_price.sql`

### Price Display Issues

**Old price still showing**
- Browser cache may have old data
- Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)
- Clear browser cache if problem persists

## Database Information

The images and pricing data is stored in the Neon PostgreSQL database:

- **Table**: `rooms`
- **Columns**:
  - `price` - Per-room price in Ghana Cedis (DECIMAL)
  - `images` - JSONB array of image objects with metadata

### Image Data Structure
```json
{
  "id": "unique-id",
  "url": "https://...",
  "type": "blob|url",
  "uploaded_at": "2026-07-31T...",
  "is_primary": true
}
```

## API Endpoints

### Get All Rooms
```
GET /api/hotels/rooms
```
Returns: Array of rooms with price and images

### Get Single Room
```
GET /api/hotels/rooms/[id]
```
Returns: Room details with price and images

### Create Room
```
POST /api/hotels/rooms
Body: {
  roomNumber: string,
  roomTypeId: string,
  floor: number,
  building: string,
  notes: string,
  price: number,
  images: RoomImage[]
}
```

### Update Room
```
PUT /api/hotels/rooms/[id]
Body: Same as create
```

### Upload Image
```
POST /api/hotels/rooms/upload
Body: FormData with "file" key
Returns: { url: string, type: "blob", uploaded_at: string }
```

## Future Features

- Image carousel for room details view
- Bulk price updates
- Price history tracking
- Seasonal pricing rules
- Image reordering/sorting
- Advanced search by price range

## Need Help?

For issues or feature requests:
1. Check this guide first
2. Review IMPLEMENTATION_NOTES.md for technical details
3. Contact your system administrator

---

**Last Updated**: July 31, 2026
**Version**: 1.0
