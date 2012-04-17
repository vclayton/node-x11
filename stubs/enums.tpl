module.exports.enums = {
{{each(i, enumName) Object.keys(enums)}}
  ${enumName}: {
    {{each(j, f) enums[enumName].field}}
      ${f.name}: ${enumVal(f, atomCounter)},
    {{/each}}
  },
{{/each}}
}
