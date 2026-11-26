# AdminPreferences

Defined in: [preferences/types.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/types.ts#L41)

The admin shell's global preferences tree.

## Remarks

Persistence only saves the diff relative to the default values, so when a later version adjusts defaults, users who have not changed anything follow the new defaults.

## Properties

### app \{#app\}

```ts
app: object;
```

Defined in: [preferences/types.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/types.ts#L43)

Application-level behavior.

#### colorGrayMode

```ts
colorGrayMode: boolean;
```

Grayscale mode.

#### colorWeakMode

```ts
colorWeakMode: boolean;
```

Color-weakness mode.

#### compact

```ts
compact: boolean;
```

Compact density: tightens control sizes.

#### dynamicTitle

```ts
dynamicTitle: boolean;
```

The title follows the current page.

#### layout

```ts
layout: LayoutMode;
```

The layout mode.

#### locale

```ts
locale: string;
```

The UI language; an empty string means following the runtime's current language.

#### timezone

```ts
timezone: string;
```

The IANA timezone; an empty string means the browser timezone.

#### watermark

```ts
watermark: boolean;
```

Shows the watermark.

#### watermarkContent

```ts
watermarkContent: string;
```

The watermark copy; an empty string uses the default copy provided by the host.

---

### breadcrumb \{#breadcrumb\}

```ts
breadcrumb: object;
```

Defined in: [preferences/types.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/types.ts#L119)

The breadcrumb.

#### enable

```ts
enable: boolean;
```

Whether to show it.

#### hideOnlyOne

```ts
hideOnlyOne: boolean;
```

Hide it when there is only one level.

#### showHome

```ts
showHome: boolean;
```

Show the home page as the first item.

#### showIcon

```ts
showIcon: boolean;
```

Show icons.

#### styleType

```ts
styleType: BreadcrumbStyle;
```

The style.

---

### content \{#content\}

```ts
content: object;
```

Defined in: [preferences/types.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/types.ts#L64)

The content area.

#### compact

```ts
compact: ContentCompact;
```

The width constraint.

#### compactWidth

```ts
compactWidth: number;
```

The maximum width (px) under `wide`.

#### padding

```ts
padding: object;
```

The padding on all four sides (px).

##### padding.bottom

```ts
bottom: number;
```

##### padding.left

```ts
left: number;
```

##### padding.right

```ts
right: number;
```

##### padding.top

```ts
top: number;
```

---

### copyright \{#copyright\}

```ts
copyright: object;
```

Defined in: [preferences/types.ts:164](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/types.ts#L164)

The copyright information.

#### companyName

```ts
companyName: string;
```

The company name.

#### companySiteLink

```ts
companySiteLink: string;
```

The company website.

#### date

```ts
date: string;
```

The year.

#### enable

```ts
enable: boolean;
```

Whether to show it.

#### icp

```ts
icp: string;
```

The filing (ICP) number.

#### icpLink

```ts
icpLink: string;
```

The filing (ICP) link.

---

### extension \{#extension\}

```ts
extension: Record<string, unknown>;
```

Defined in: [preferences/types.ts:220](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/types.ts#L220)

The extension preferences registered by the application, keyed by extension key.

---

### footer \{#footer\}

```ts
footer: object;
```

Defined in: [preferences/types.ts:155](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/types.ts#L155)

The footer.

#### enable

```ts
enable: boolean;
```

Whether to show it.

#### fixed

```ts
fixed: boolean;
```

Fixed to the bottom of the viewport.

#### height

```ts
height: number;
```

The height (px).

---

### header \{#header\}

```ts
header: object;
```

Defined in: [preferences/types.ts:112](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/types.ts#L112)

The top bar.

#### height

```ts
height: number;
```

The top bar height (px).

#### menuAlign

```ts
menuAlign: MenuAlign;
```

The alignment of the top navigation menu.

---

### logo \{#logo\}

```ts
logo: object;
```

Defined in: [preferences/types.ts:179](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/types.ts#L179)

The logo.

#### enable

```ts
enable: boolean;
```

Whether to show it.

#### showText

```ts
showText: boolean;
```

Also show the application name.

#### source

```ts
source: string;
```

The image URL; an empty string shows only text.

---

### navigation \{#navigation\}

```ts
navigation: object;
```

Defined in: [preferences/types.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/types.ts#L105)

The navigation menu.

#### accordion

```ts
accordion: boolean;
```

Accordion: only one group expanded per level.

#### styleType

```ts
styleType: NavigationStyle;
```

The menu style.

---

### palette \{#palette\}

```ts
palette: object;
```

Defined in: [preferences/types.ts:199](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/types.ts#L199)

The command palette.

#### maxResults

```ts
maxResults: number;
```

The maximum number of results per group.

#### recents

```ts
recents: number;
```

The number of recent usage entries shown on an empty query; 0 disables it.

---

### shortcuts \{#shortcuts\}

```ts
shortcuts: object;
```

Defined in: [preferences/types.ts:206](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/types.ts#L206)

The shortcuts.

#### disabled

```ts
disabled: string[];
```

The ids of the shortcuts disabled by the user.

#### enable

```ts
enable: boolean;
```

The master switch.

---

### sidebar \{#sidebar\}

```ts
sidebar: object;
```

Defined in: [preferences/types.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/types.ts#L88)

The sidebar.

#### collapsed

```ts
collapsed: boolean;
```

Collapse into an icon rail.

#### collapsedShowTitle

```ts
collapsedShowTitle: boolean;
```

Still show menu titles when collapsed.

#### collapseWidth

```ts
collapseWidth: number;
```

The collapsed width (px).

#### draggable

```ts
draggable: boolean;
```

Allow dragging to resize the width.

#### enable

```ts
enable: boolean;
```

Whether to render the sidebar.

#### expandOnHover

```ts
expandOnHover: boolean;
```

Temporarily expand on hover when collapsed.

#### width

```ts
width: number;
```

The expanded width (px).

---

### tabbar \{#tabbar\}

```ts
tabbar: object;
```

Defined in: [preferences/types.ts:132](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/types.ts#L132)

The tab bar.

#### draggable

```ts
draggable: boolean;
```

Allow drag to reorder.

#### enable

```ts
enable: boolean;
```

Whether to show it.

#### maxCount

```ts
maxCount: number;
```

The maximum number of tabs; 0 means unlimited.

#### middleClickToClose

```ts
middleClickToClose: boolean;
```

Close a tab with a middle click.

#### persist

```ts
persist: TabbarPersist;
```

The persistence location.

#### showIcon

```ts
showIcon: boolean;
```

Show icons.

#### showMaximize

```ts
showMaximize: boolean;
```

The context menu offers "Maximize content".

#### styleType

```ts
styleType: TabbarStyle;
```

The style.

#### visitHistory

```ts
visitHistory: boolean;
```

Record visit history.

#### wheelable

```ts
wheelable: boolean;
```

Scroll tabs horizontally with the wheel.

---

### theme \{#theme\}

```ts
theme: object;
```

Defined in: [preferences/types.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/types.ts#L73)

The theme decoration layer.

#### colorPrimary

```ts
colorPrimary: string;
```

The primary color (`#rrggbb`); an empty string follows the theme's own.

#### fontSize

```ts
fontSize: number | null;
```

The base font size (px); `null` follows the theme's own.

#### name

```ts
name: string;
```

The theme name; `system` follows the system's dark / light mode.

#### radius

```ts
radius: Radius | null;
```

The radius tier; `null` follows the theme's own.

#### semiDarkHeader

```ts
semiDarkHeader: boolean;
```

Half-dark top bar.

#### semiDarkSidebar

```ts
semiDarkSidebar: boolean;
```

Half-dark sidebar.

---

### transition \{#transition\}

```ts
transition: object;
```

Defined in: [preferences/types.ts:188](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/types.ts#L188)

The page transition.

#### enable

```ts
enable: boolean;
```

Enable the transition animation.

#### loading

```ts
loading: boolean;
```

The overlay loading state during navigation.

#### name

```ts
name: TransitionName;
```

The animation name.

#### progress

```ts
progress: boolean;
```

The top progress bar.

---

### widget \{#widget\}

```ts
widget: object;
```

Defined in: [preferences/types.ts:213](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/types.ts#L213)

The top bar widgets.

#### hidden

```ts
hidden: WidgetKey[];
```

The hidden widgets; `preferences` cannot be hidden.

#### order

```ts
order: WidgetKey[];
```

The widget order, always a permutation of [WidgetKey](../type-aliases/WidgetKey.md).
