# Room Images & Per-Room Pricing Implementation

## Summary
Added comprehensive image upload and per-room pricing functionality to the hotel management system. Admins/Managers can now upload hotel room images and set individual prices for each room, independent of room type pricing.

## Features Implemented

### 1. Per-Room Pricing
- **Price Field**: Added required price input to Add/Edit Room dialogs
- **Price Storage**: Stored in `rooms.price` column (nullable, falls back to room type base_price)
- **Display**: Shows per-room price in room listing table
- **Validation**: Price is now a required field when adding/editing rooms

### 2. Image Management
- **Multiple Images**: Support for 1-10 images per room
- **Upload Methods**:
  - **From Computer**: Drag-drop file upload with file input
  - **URL Input**: Direct image URL input for external images
- **Preview Gallery**: Thumbnail grid showing all uploaded images
- **Image Removal**: Delete button on each image (visible on hover)
- **Blob Storage**: Uses Vercel Blob for file uploads with automatic CDN optimization

### 3. Table Display
- **Image Column**: Added to show primary room image (or placeholder)
- **Price Column**: Updated to display per-room pricing
- **Thumbnail**: 48x48px rounded image preview in room list

## Files Modified

### Frontend Components
- **`/app/hotels/rooms/page.tsx`**
  - Updated `Room` interface with `price` and `images` fields
  - Added `RoomImage` interface for image metadata
  - Added image handling functions: `handleFileUpload`, `handleAddImageUrl`, `handleRemoveImage`
  - Updated form state with `price` and `images` fields
  - Added image preview gallery UI in both Add and Edit dialogs
  - Updated table to show primary image and per-room price
  - Enhanced validation to require price field
  - Added UI for drag-drop file upload and URL input

### Backend APIs
- **`/app/api/hotels/rooms/route.ts`**
  - Updated GET: Now returns `price` and `images` from rooms table
  - Updated POST: Accepts `price` and `images` in request body
  - Added price validation requirement

- **`/app/api/hotels/rooms/[id]/route.ts`**
  - Added PUT endpoint for full room updates with price and images
  - Updated GET: Returns price and images
  - Improved query with all necessary fields

- **`/app/api/hotels/rooms/upload/route.ts` (NEW)**
  - Handles multipart file uploads
  - Validates file type (image only) and size (5MB limit)
  - Uploads to Vercel Blob with public access
  - Returns image URL and metadata

### Database
- **`/migrations/add_room_images_and_price.sql` (NEW)**
  - Adds `price` column (DECIMAL) to rooms table
  - Adds `images` column (JSONB array) to rooms table
  - Creates indexes for performance
  - Includes documentation comments

### Configuration
- **`/next.config.mjs`**
  - Removed deprecated experimental options
  - Maintained webpackMemoryOptimizations
  - Already includes image optimization domains

### Dependencies
- **`@vercel/blob`**: Added for image upload and storage

## Data Structure

### Image Object (JSONB)
```json
{
  "id": "unique-identifier",
  "url": "https://...",
  "type": "blob|url",
  "uploaded_at": "ISO-8601 timestamp",
  "is_primary": true/false
}
```

### Database Changes
```sql
ALTER TABLE rooms ADD COLUMN price DECIMAL(10, 2);
ALTER TABLE rooms ADD COLUMN images JSONB DEFAULT '[]'::jsonb;
```

## UI/UX Features

### Add/Edit Room Dialog
1. **Price Input**: Required field with helper text
2. **Image Upload Section**:
   - Drag-drop zone for files from computer
   - URL input with "Add URL" button
   - Live preview gallery showing all images
   - Hover delete button on each image
   - Recommendation for image size (800x600px+)

### Room Listing Table
- **Image Column**: Thumbnail (48x48px) of primary image or placeholder
- **Price Column**: Displays per-room price (GHS format)
- **Edit Integration**: Loading room price/images when editing

## Technical Implementation

### Image Upload Flow
1. User selects files or enters URL
2. Files are uploaded to `/api/hotels/rooms/upload`
3. Server validates and uploads to Vercel Blob
4. Returns image URL and metadata
5. Client adds to preview and form state
6. When saving room, images array is sent to API

### Price Hierarchy
1. If `rooms.price` is set → use that
2. Otherwise → fallback to `room_types.base_price`
3. API query uses: `COALESCE(r.price, rt.base_price) as price`

### Validation
- **Add/Edit**: Room Number, Type, and Price are all required
- **Images**: Optional but recommended
- **File Size**: 5MB limit per image
- **File Type**: Images only (validated on server)

## Migration Instructions

### For Existing Database
Run the migration to add columns:
```bash
psql $DATABASE_URL -f migrations/add_room_images_and_price.sql
```

### For New Deployments
The migration can be run as part of deployment setup or manually after db initialization.

## Testing Checklist

- [x] Add room form displays with price input
- [x] Image upload section shows file and URL options
- [x] Image preview gallery displays thumbnails
- [x] Image delete button works
- [x] Room table shows image column
- [x] Room table shows per-room price
- [x] API returns price and images
- [x] Validation requires price field
- [x] Edit form pre-populates price and images
- [ ] Database migration creates columns (manual verification needed)
- [ ] Vercel Blob upload works with real files
- [ ] Images persist after room save

## Future Enhancements

1. **Image Reordering**: Drag-to-reorder images in gallery
2. **Image Optimization**: Auto-crop/resize before upload
3. **Bulk Operations**: Set prices for multiple rooms at once
4. **Image Gallery Modal**: Full-screen image viewer for room details
5. **Default Pricing Rules**: Auto-set price based on room type with override
6. **Image Validation**: Client-side preview before upload
7. **Rate Limiting**: Limit image uploads per room per day
8. **Historical Pricing**: Track price changes over time

## Known Limitations

1. **Database Schema**: Requires running migration SQL - do not rely on auto-initialization
2. **Image Storage**: Vercel Blob costs apply for image storage
3. **URL Images**: External image URLs must remain accessible (no local caching)
4. **File Size**: Hard limit of 5MB per image file
5. **Image Count**: UI recommends 1-10 images (no hard limit in code)

## Performance Considerations

- Images are stored by URL only (not duplicated)
- JSONB index on images column for fast queries
- Price index on rooms.price for sorting/filtering
- Lazy loading of images in table (64x64 thumbnails)
- CDN optimization via Vercel Blob or external URLs

## Security

- File upload validates type and size server-side
- Blob storage uses public access (images are public)
- No authentication required for image viewing (as intended)
- CORS headers already configured in next.config.mjs
