/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// backwards compatibility
let Mongo
if (typeof Mongo === 'undefined') {
  Mongo = {}
  Mongo.Collection = Meteor.Collection
}

Mongo.Collection.prototype.friendlySlugs = function (options) {
  let fsDebug
  if (options == null) {
    options = {}
  }
  const collection = this

  if (!_.isArray(options)) {
    options = [options]
  }

  _.each(options, function (opts) {
    if (_.isString(opts)) {
      opts = {
        slugFrom: [opts],
      }
    }
    if (_.isString(opts.slugFrom)) {
      opts.slugFrom = [opts.slugFrom]
    }

    const defaults = {
      slugFrom: ['name'],
      slugField: 'slug',
      distinct: true,
      distinctUpTo: [],
      updateSlug: true,
      createOnUpdate: true,
      maxLength: 0,
      debug: false,
      transliteration: [
        { from: 'àáâäåãа', to: 'a' },
        { from: 'б', to: 'b' },
        { from: 'çč', to: 'c' },
        { from: 'дď', to: 'd' },
        { from: 'èéêëẽэеě', to: 'e' },
        { from: 'ф', to: 'f' },
        { from: 'г', to: 'g' },
        { from: 'х', to: 'h' },
        { from: 'ìíîïи', to: 'i' },
        { from: 'к', to: 'k' },
        { from: 'л', to: 'l' },
        { from: 'м', to: 'm' },
        { from: 'ñнň', to: 'n' },
        { from: 'òóôöõо', to: 'o' },
        { from: 'п', to: 'p' },
        { from: 'рř', to: 'r' },
        { from: 'сš', to: 's' },
        { from: 'тť', to: 't' },
        { from: 'ùúûüуů', to: 'u' },
        { from: 'в', to: 'v' },
        { from: 'йыý', to: 'y' },
        { from: 'зž', to: 'z' },
        { from: 'æ', to: 'ae' },
        { from: 'ч', to: 'ch' },
        { from: 'щ', to: 'sch' },
        { from: 'ш', to: 'sh' },
        { from: 'ц', to: 'ts' },
        { from: 'я', to: 'ya' },
        { from: 'ю', to: 'yu' },
        { from: 'ж', to: 'zh' },
        { from: 'ъь', to: '' },
      ],
    }

    _.defaults(opts, defaults)

    const fields = {
      slugFrom: Array,
      slugField: String,
      distinct: Boolean,
      createOnUpdate: Boolean,
      maxLength: Number,
      debug: Boolean,
    }

    if (typeof opts.updateSlug !== 'function') {
      if (opts.updateSlug) {
        opts.updateSlug = () => true
      } else {
        opts.updateSlug = () => false
      }
    }

    check(opts, Match.ObjectIncluding(fields))

    collection.before.insert(function (userId, doc) {
      fsDebug(opts, 'before.insert function')
      runSlug(doc, opts)
    })

    collection.before.update(function (userId, doc, fieldNames, modifier, options) {
      fsDebug(opts, 'before.update function')
      const cleanModifier = function () {
        //Cleanup the modifier if needed
        if (_.isEmpty(modifier.$set)) {
          return delete modifier.$set
        }
      }

      //Don't do anything if this is a multi doc update
      options = options || {}
      if (options.multi) {
        fsDebug(opts, "multi doc update attempted, can't update slugs this way, leaving.")
        return true
      }

      modifier = modifier || {}
      modifier.$set = modifier.$set || {}

      //Don't do anything if all the slugFrom fields aren't present (before or after update)
      let cont = false
      _.each(opts.slugFrom, function (slugFrom) {
        if (
          stringToNested(doc, slugFrom) ||
          modifier.$set[slugFrom] != null ||
          stringToNested(modifier.$set, slugFrom)
        ) {
          return (cont = true)
        }
      })
      if (!cont) {
        fsDebug(opts, 'no slugFrom fields are present (either before or after update), leaving.')
        cleanModifier()
        return true
      }

      //See if any of the slugFrom fields have changed
      let slugFromChanged = false
      _.each(opts.slugFrom, function (slugFrom) {
        if (modifier.$set[slugFrom] != null || stringToNested(modifier.$set, slugFrom)) {
          const docFrom = stringToNested(doc, slugFrom)
          if (docFrom !== modifier.$set[slugFrom] && docFrom !== stringToNested(modifier.$set, slugFrom)) {
            return (slugFromChanged = true)
          }
        }
      })

      fsDebug(opts, slugFromChanged, 'slugFromChanged')

      //Is the slug missing / Is this an existing item we have added a slug to? AND are we supposed to create a slug on update?
      if (!stringToNested(doc, opts.slugField) && opts.createOnUpdate) {
        fsDebug(opts, 'Update: Slug Field is missing and createOnUpdate is set to true')

        if (slugFromChanged) {
          fsDebug(opts, 'slugFrom field has changed, runSlug with modifier')
          runSlug(doc, opts, modifier)
        } else {
          //Run the slug to create
          fsDebug(opts, 'runSlug to create')
          runSlug(doc, opts, modifier, true)
          cleanModifier()
          return true
        }
      } else {
        // Don't change anything on update if updateSlug is false
        if ((typeof opts.updateSlug === 'function' ? opts.updateSlug(doc, modifier) : undefined) === false) {
          fsDebug(opts, 'updateSlug is false, nothing to do.')
          cleanModifier()
          return true
        }

        //Don't do anything if the slug from field has not changed
        if (!slugFromChanged) {
          fsDebug(opts, 'slugFrom field has not changed, nothing to do.')
          cleanModifier()
          return true
        }

        runSlug(doc, opts, modifier)

        cleanModifier()
        return true
      }

      cleanModifier()
      return true
    })
  })
  var runSlug = function (doc, opts, modifier, create) {
    let finalSlug, index
    if (modifier == null) {
      modifier = false
    }
    if (create == null) {
      create = false
    }
    fsDebug(opts, 'Begin runSlug')
    fsDebug(opts, opts, 'Options')
    fsDebug(opts, modifier, 'Modifier')
    fsDebug(opts, create, 'Create')

    const combineFrom = function (doc, fields, modifierDoc) {
      const fromValues = []
      _.each(fields, function (f) {
        let val
        if (modifierDoc != null) {
          if (stringToNested(modifierDoc, f)) {
            val = stringToNested(modifierDoc, f)
          } else {
            val = stringToNested(doc, f)
          }
        } else {
          val = stringToNested(doc, f)
        }
        if (val) {
          return fromValues.push(val)
        }
      })
      if (fromValues.length === 0) {
        return false
      }
      return fromValues.join('-')
    }

    const from = create || !modifier ? combineFrom(doc, opts.slugFrom) : combineFrom(doc, opts.slugFrom, modifier.$set)

    if (from === false) {
      fsDebug(opts, 'Nothing to slug from, leaving.')
      return true
    }

    fsDebug(opts, from, 'Slugging From')

    let slugBase = slugify(from, opts.transliteration, opts.maxLength)
    if (!slugBase) {
      return false
    }

    fsDebug(opts, slugBase, 'SlugBase before reduction')

    if (opts.distinct) {
      // Check to see if this base has a -[0-9999...] at the end, reduce to a real base
      slugBase = slugBase.replace(/(-\d+)+$/, '')
      fsDebug(opts, slugBase, 'SlugBase after reduction')

      const baseField = 'friendlySlugs.' + opts.slugField + '.base'
      const indexField = 'friendlySlugs.' + opts.slugField + '.index'

      const fieldSelector = {}
      fieldSelector[baseField] = slugBase

      let i = 0
      while (i < opts.distinctUpTo.length) {
        const f = opts.distinctUpTo[i]
        fieldSelector[f] = doc[f]
        i++
      }

      const sortSelector = {}
      sortSelector[indexField] = -1

      const limitSelector = {}
      limitSelector[indexField] = 1

      const result = collection.findOne(fieldSelector, {
        sort: sortSelector,
        fields: limitSelector,
        limit: 1,
      })

      fsDebug(opts, result, 'Highest indexed base found')

      if (
        result == null ||
        result.friendlySlugs == null ||
        result.friendlySlugs[opts.slugField] == null ||
        result.friendlySlugs[opts.slugField].index == null
      ) {
        index = 0
      } else {
        index = result.friendlySlugs[opts.slugField].index + 1
      }

      const defaultSlugGenerator = function (slugBase, index) {
        if (index === 0) {
          return slugBase
        } else {
          return slugBase + '-' + index
        }
      }

      const slugGenerator = opts.slugGenerator != null ? opts.slugGenerator : defaultSlugGenerator

      finalSlug = slugGenerator(slugBase, index)
    } else {
      //Not distinct, just set the base
      index = false
      finalSlug = slugBase
    }

    fsDebug(opts, finalSlug, 'finalSlug')

    if (modifier || create) {
      fsDebug(opts, 'Set to modify or create slug on update')
      modifier = modifier || {}
      modifier.$set = modifier.$set || {}
      modifier.$set.friendlySlugs = doc.friendlySlugs || {}
      modifier.$set.friendlySlugs[opts.slugField] = modifier.$set.friendlySlugs[opts.slugField] || {}
      modifier.$set.friendlySlugs[opts.slugField].base = slugBase
      modifier.$set.friendlySlugs[opts.slugField].index = index
      modifier.$set[opts.slugField] = finalSlug
      fsDebug(opts, modifier, 'Final Modifier')
    } else {
      fsDebug(opts, 'Set to update')
      doc.friendlySlugs = doc.friendlySlugs || {}
      doc.friendlySlugs[opts.slugField] = doc.friendlySlugs[opts.slugField] || {}
      doc.friendlySlugs[opts.slugField].base = slugBase
      doc.friendlySlugs[opts.slugField].index = index
      doc[opts.slugField] = finalSlug
      fsDebug(opts, doc, 'Final Doc')
    }
    return true
  }

  return (fsDebug = function (opts, item, label) {
    if (label == null) {
      label = ''
    }
    if (!opts.debug) {
      return
    }
    if (typeof item === 'object') {
      console.log('friendlySlugs DEBUG: ' + label + '↓')
      return console.log(item)
    } else {
      return console.log('friendlySlugs DEBUG: ' + label + '= ' + item)
    }
  })
}

var slugify = function (text, transliteration, maxLength) {
  if (text == null) {
    return false
  }
  if (text.length < 1) {
    return false
  }
  text = text.toString().toLowerCase()
  _.each(transliteration, item => (text = text.replace(new RegExp('[' + item.from + ']', 'g'), item.to)))
  let slug = text
    .replace(/'/g, '') // Remove all apostrophes
    .replace(/[^0-9a-z-]/g, '-') // Replace anything that is not 0-9, a-z, or - with -
    .replace(/\-\-+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, '') // Trim - from end of text
  if (maxLength > 0 && slug.length > maxLength) {
    const lastDash = slug.substring(0, maxLength).lastIndexOf('-')
    slug = slug.substring(0, lastDash)
  }
  return slug
}

var stringToNested = function (obj, path) {
  const parts = path.split('.')
  if (parts.length === 1) {
    if (obj != null && obj[parts[0]] != null) {
      return obj[parts[0]]
    } else {
      return false
    }
  }
  return stringToNested(obj[parts[0]], parts.slice(1).join('.'))
}
