"use strict";
/**
 * Standard minerals list, covering every mineral written in the license list.
 * Safe to re-run: missing minerals are added; for existing ones, any new
 * aliases are merged in and names/categories edited in the app are kept.
 */
const { v4: uuidv4 } = require("uuid");

const MINERALS = [
  // Precious metals
  { name: "Gold", category: "precious_metal", aliases: ["primary gold", "gold mineral", "gold ore", "hard rock gold"] },
  { name: "Placer Gold", category: "precious_metal", aliases: ["alluvial gold", "placer"] },
  { name: "Platinum", category: "precious_metal", aliases: ["platinum group metals", "pgm"] },
  { name: "Silver", category: "precious_metal", aliases: [] },
  // Base and ferrous metals
  { name: "Base Metals", category: "base_metal", aliases: ["basemetals", "base metal"] },
  { name: "Copper", category: "base_metal", aliases: ["copper related metals"] },
  { name: "Zinc", category: "base_metal", aliases: [] },
  { name: "Lead", category: "base_metal", aliases: [] },
  { name: "Iron Ore", category: "base_metal", aliases: ["iron", "iron ore mineral"] },
  { name: "Chromite", category: "base_metal", aliases: ["chrome", "chromium"] },
  { name: "Manganese", category: "base_metal", aliases: [] },
  // Battery / critical metals
  { name: "Lithium", category: "battery_metal", aliases: [] },
  { name: "Nickel", category: "battery_metal", aliases: [] },
  { name: "Cobalt", category: "battery_metal", aliases: [] },
  { name: "Tantalum", category: "battery_metal", aliases: ["tantalite", "coltan"] },
  { name: "Niobium", category: "battery_metal", aliases: [] },
  { name: "Beryllium", category: "battery_metal", aliases: ["beryl"] },
  { name: "Rare Earth Elements", category: "battery_metal", aliases: ["rare earth metals", "rare earths", "ree"] },
  // Energy
  { name: "Coal", category: "energy", aliases: [] },
  { name: "Uranium", category: "energy", aliases: [] },
  // Industrial minerals
  { name: "Potash", category: "industrial", aliases: ["potassium"] },
  { name: "Sulfur", category: "industrial", aliases: ["sulphur"] },
  { name: "Salt", category: "industrial", aliases: ["rock salt", "salt processing"] },
  { name: "Bromine", category: "industrial", aliases: [] },
  { name: "Soda Ash", category: "industrial", aliases: ["sodium carbonate", "trona"] },
  { name: "Gypsum", category: "industrial", aliases: [] },
  { name: "Silica Sand", category: "industrial", aliases: ["silica", "sand stone", "sandstone", "quartz sand"] },
  { name: "Quartz", category: "industrial", aliases: [] },
  { name: "Clay", category: "industrial", aliases: [] },
  { name: "Kaolin", category: "industrial", aliases: ["kaolin clay"] },
  { name: "Feldspar", category: "industrial", aliases: [] },
  { name: "Diatomite", category: "industrial", aliases: [] },
  { name: "Bentonite", category: "industrial", aliases: [] },
  { name: "Phosphate", category: "industrial", aliases: [] },
  // Construction / dimension stone
  { name: "Limestone", category: "construction", aliases: [] },
  { name: "Marble", category: "construction", aliases: [] },
  { name: "Granite", category: "construction", aliases: [] },
  { name: "Basalt", category: "construction", aliases: [] },
  { name: "Marl", category: "construction", aliases: [] },
  { name: "Pumice", category: "construction", aliases: ["scoria"] },
  { name: "Construction Materials", category: "construction", aliases: ["construction minerals", "aggregate", "sand and gravel"] },
  // Gemstones
  { name: "Gemstones", category: "gemstone", aliases: ["gemstone", "gems", "precious stones", "semi precious stones"] },
  { name: "Opal", category: "gemstone", aliases: [] },
  { name: "Emerald", category: "gemstone", aliases: [] },
  { name: "Sapphire", category: "gemstone", aliases: [] },
];

module.exports = {
  MINERALS,

  async up(queryInterface) {
    const now = new Date();
    for (const m of MINERALS) {
      // Category by its stable code (categories themselves are editable in the app);
      // an existing mineral keeps whatever category it was given in the app
      await queryInterface.sequelize.query(
        `INSERT INTO minerals (mineral_id, name, category_id, aliases, is_active, created_at, updated_at)
         VALUES (
           :id, :name,
           COALESCE(
             (SELECT category_id FROM mineral_categories WHERE code = :category),
             (SELECT category_id FROM mineral_categories WHERE code = 'other')
           ),
           ARRAY[:aliases]::varchar[], true, :now, :now)
         ON CONFLICT (name) DO UPDATE SET
           aliases = (SELECT ARRAY(SELECT DISTINCT unnest(minerals.aliases || EXCLUDED.aliases)))`,
        {
          replacements: {
            id: uuidv4(),
            name: m.name,
            category: m.category,
            // ARRAY[NULL] for an empty list would insert one NULL; use a placeholder that is filtered below
            aliases: m.aliases.length ? m.aliases : [""],
            now,
          },
        },
      );
    }
    // Drop the empty-list placeholder
    await queryInterface.sequelize.query(`UPDATE minerals SET aliases = array_remove(aliases, '')`);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("minerals", { name: MINERALS.map((m) => m.name) });
  },
};
