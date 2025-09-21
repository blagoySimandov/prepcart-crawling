import { describe, it, expect } from "vitest";
import { extractNavigationUris } from "./index.js";
import { ExtractedData, CatalogueElement } from "../types.js";

describe("extractNavigationUris", () => {
  it("should return an empty array for empty input", () => {
    const input: ExtractedData = { data: [] };
    const result = extractNavigationUris(input);
    expect(result).toEqual([]);
  });

  it("should return an empty array for null/undefined data", () => {
    expect(extractNavigationUris({} as ExtractedData)).toEqual([]);
    expect(extractNavigationUris({ data: null } as any)).toEqual([]);
    expect(extractNavigationUris({ data: undefined } as any)).toEqual([]);
  });

  it("should extract leaf navigation links without children", () => {
    const input: ExtractedData = {
      data: [
        {
          initialData: {
            catalogue: [
              {
                name: "Leaf Link 1",
                action: {
                  type: "NAVIGATION",
                  data: { path: "/path1" },
                },
              },
              {
                name: "Leaf Link 2",
                action: {
                  type: "NAVIGATION",
                  data: { path: "/path2" },
                },
              },
            ] as CatalogueElement[],
          },
        },
      ],
    };

    const result = extractNavigationUris(input);
    expect(result).toEqual([
      { name: "Leaf Link 1", uri: "/path1" },
      { name: "Leaf Link 2", uri: "/path2" },
    ]);
  });

  it("should exclude parent navigation links that have children", () => {
    const input: ExtractedData = {
      data: [
        {
          initialData: {
            catalogue: [
              {
                name: "Parent Link",
                action: {
                  type: "NAVIGATION",
                  data: { path: "/parent" },
                },
                elements: [
                  {
                    name: "Child Link 1",
                    action: {
                      type: "NAVIGATION",
                      data: { path: "/child1" },
                    },
                  },
                  {
                    name: "Child Link 2",
                    action: {
                      type: "NAVIGATION",
                      data: { path: "/child2" },
                    },
                  },
                ],
              },
            ] as CatalogueElement[],
          },
        },
      ],
    };

    const result = extractNavigationUris(input);
    // Parent Link should NOT be included
    expect(result).toEqual([
      { name: "Child Link 1", uri: "/child1" },
      { name: "Child Link 2", uri: "/child2" },
    ]);
  });

  it("should handle nested hierarchies and only extract deepest leaf nodes", () => {
    const input: ExtractedData = {
      data: [
        {
          initialData: {
            catalogue: [
              {
                name: "Root",
                action: {
                  type: "NAVIGATION",
                  data: { path: "/root" },
                },
                elements: [
                  {
                    name: "Level 1",
                    action: {
                      type: "NAVIGATION",
                      data: { path: "/level1" },
                    },
                    elements: [
                      {
                        name: "Level 2A",
                        action: {
                          type: "NAVIGATION",
                          data: { path: "/level2a" },
                        },
                        elements: [
                          {
                            name: "Leaf A",
                            action: {
                              type: "NAVIGATION",
                              data: { path: "/leaf-a" },
                            },
                          },
                        ],
                      },
                      {
                        name: "Leaf B",
                        action: {
                          type: "NAVIGATION",
                          data: { path: "/leaf-b" },
                        },
                      },
                    ],
                  },
                ],
              },
              {
                name: "Standalone Leaf",
                action: {
                  type: "NAVIGATION",
                  data: { path: "/standalone" },
                },
              },
            ] as CatalogueElement[],
          },
        },
      ],
    };

    const result = extractNavigationUris(input);
    // Only the deepest leaves should be included
    expect(result).toEqual([
      { name: "Leaf A", uri: "/leaf-a" },
      { name: "Leaf B", uri: "/leaf-b" },
      { name: "Standalone Leaf", uri: "/standalone" },
    ]);
  });

  it("should skip non-navigation elements", () => {
    const input: ExtractedData = {
      data: [
        {
          initialData: {
            catalogue: [
              {
                name: "Non-nav element",
                action: {
                  type: "OTHER_ACTION",
                  data: { path: "/other" },
                },
              },
              {
                name: "No action element",
              },
              {
                name: "Valid Nav",
                action: {
                  type: "NAVIGATION",
                  data: { path: "/valid" },
                },
              },
            ] as CatalogueElement[],
          },
        },
      ],
    };

    const result = extractNavigationUris(input);
    expect(result).toEqual([{ name: "Valid Nav", uri: "/valid" }]);
  });

  it("should handle elements with children but no navigation action", () => {
    const input: ExtractedData = {
      data: [
        {
          initialData: {
            catalogue: [
              {
                name: "Container without nav",
                elements: [
                  {
                    name: "Child 1",
                    action: {
                      type: "NAVIGATION",
                      data: { path: "/child1" },
                    },
                  },
                  {
                    name: "Child 2",
                    action: {
                      type: "NAVIGATION",
                      data: { path: "/child2" },
                    },
                  },
                ],
              },
            ] as CatalogueElement[],
          },
        },
      ],
    };

    const result = extractNavigationUris(input);
    expect(result).toEqual([
      { name: "Child 1", uri: "/child1" },
      { name: "Child 2", uri: "/child2" },
    ]);
  });

  it("should handle multiple data items with catalogues", () => {
    const input: ExtractedData = {
      data: [
        {
          initialData: {
            catalogue: [
              {
                name: "Item 1",
                action: {
                  type: "NAVIGATION",
                  data: { path: "/item1" },
                },
              },
            ] as CatalogueElement[],
          },
        },
        {
          initialData: {
            catalogue: [
              {
                name: "Item 2",
                action: {
                  type: "NAVIGATION",
                  data: { path: "/item2" },
                },
              },
            ] as CatalogueElement[],
          },
        },
      ],
    };

    const result = extractNavigationUris(input);
    expect(result).toEqual([
      { name: "Item 1", uri: "/item1" },
      { name: "Item 2", uri: "/item2" },
    ]);
  });

  it("should handle missing path in navigation action", () => {
    const input: ExtractedData = {
      data: [
        {
          initialData: {
            catalogue: [
              {
                name: "No path",
                action: {
                  type: "NAVIGATION",
                  data: {} as any,
                },
              },
              {
                name: "Valid",
                action: {
                  type: "NAVIGATION",
                  data: { path: "/valid" },
                },
              },
            ] as CatalogueElement[],
          },
        },
      ],
    };

    const result = extractNavigationUris(input);
    expect(result).toEqual([{ name: "Valid", uri: "/valid" }]);
  });

  it("should handle empty elements array in parent", () => {
    const input: ExtractedData = {
      data: [
        {
          initialData: {
            catalogue: [
              {
                name: "Parent with empty elements",
                action: {
                  type: "NAVIGATION",
                  data: { path: "/parent" },
                },
                elements: [],
              },
              {
                name: "Regular leaf",
                action: {
                  type: "NAVIGATION",
                  data: { path: "/leaf" },
                },
              },
            ] as CatalogueElement[],
          },
        },
      ],
    };

    const result = extractNavigationUris(input);
    // Parent with empty elements array should still be considered as having children
    expect(result).toEqual([
      { name: "Parent with empty elements", uri: "/parent" },
      { name: "Regular leaf", uri: "/leaf" },
    ]);
  });
});
