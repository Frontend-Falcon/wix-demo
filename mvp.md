Use the **design taste frontend skill** to design and build an MVP web app that allows me to paste HTML blog content and publish it to my Wix Blog site.

### Wix Site
Site URL: https://himanshusharma35.wixstudio.com/content-hub

### Existing Configuration
- `AUTH_TOKEN` is already available in `.env.local`.
  - It is an API key with **Blog** and **Ricos JSON** permissions.
- The **Site ID** and **Member ID** are already configured in `utils/constants.ts`.
- Use the existing project structure and conventions wherever possible.

### Wix API Integration
The required Wix APIs are documented in **`Wix Integration.yml`**.

Integrate all APIs from this file **except**:
- Get Member
- Fetch Published Post

Explore the available Wix APIs using the relevant skills/documentation and improve the request payloads where appropriate rather than blindly using the YAML definitions.

### Blog Editor / Create Draft Form
Build a proper, polished form where I can:

1. Paste my blog content as **HTML**.
2. Enter/configure SEO-related fields.
3. Configure all other fields/options supported by the **Create Draft Post** payload.
4. Provide sensible, automatically populated defaults wherever possible.
5. Clearly explain in the UI what each important payload field is used for and why it is being sent to Wix.

### HTML → Ricos Conversion
When creating a draft:

1. Take the HTML content entered by the user.
2. Use the **Wix Ricos API** to convert the HTML into **Ricos JSON**.
3. Use the resulting Ricos JSON in the Wix Blog draft creation request.
4. Handle conversion/API errors gracefully and show useful error messages in the UI.

### Publishing Flow
After a post is successfully published:

- Show a confirmation popup/modal.
- Provide an action to **View Post** that opens the published post on the Wix website.
- Display the relevant post information in the confirmation state.

### Home / Dashboard
The home screen should fetch and display both:

- Draft posts
- Published posts

Provide appropriate CRUD operations based on the supported Wix APIs, such as:

- Create
- View
- Edit/update
- Delete
- Publish/unpublish where supported by the APIs

Clearly distinguish between **Draft** and **Published** posts in the UI.

### UX / Design Requirements
- Use the **design taste frontend skill** and create a polished, modern interface rather than a basic form.
- Prioritize a clean developer-friendly UX.
- Make the blog creation flow easy to understand.
- Show loading, success, empty, and error states.
- Use confirmation dialogs for destructive actions.
- Make API-related failures understandable to the user.
- Keep the MVP focused, but make the architecture clean and extensible.

### Important
Before implementing, inspect:
- `Wix Integration.yml`
- Existing project structure
- Existing utilities/constants
- Available Wix API/SDK documentation and skills

Reuse existing code where appropriate and avoid duplicating functionality.

The final implementation should be a **working end-to-end MVP**, not just a UI mockup.