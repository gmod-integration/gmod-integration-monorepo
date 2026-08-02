import { describe, expect, it } from 'vitest'
import { BaseClass } from '../../../src/classes/v3/BaseClass.js'

describe('BaseClass', () => {
  describe('isValid', () => {
    it('is true when every own property is set', () => {
      const instance = new BaseClass()
      instance.a = 1
      instance.b = 'x'
      expect(instance.isValid()).toBe(true)
    })

    it('is false when a property is null', () => {
      const instance = new BaseClass()
      instance.a = null
      expect(instance.isValid()).toBe(false)
    })

    it('is false when a property is undefined', () => {
      const instance = new BaseClass()
      instance.a = undefined
      expect(instance.isValid()).toBe(false)
    })

    it('recurses into nested BaseClass-like objects', () => {
      const instance = new BaseClass()
      const nestedValid = new BaseClass()
      nestedValid.x = 1
      instance.nested = nestedValid
      expect(instance.isValid()).toBe(true)

      const nestedInvalid = new BaseClass()
      nestedInvalid.x = null
      instance.nested = nestedInvalid
      expect(instance.isValid()).toBe(false)
    })
  })

  describe('checkMissingAndThrow', () => {
    it('does nothing when throwMissing is false', () => {
      const instance = new BaseClass()
      expect(() => instance.checkMissingAndThrow({}, { a: 'number' }, false)).not.toThrow()
    })

    it('throws when a required key is missing', () => {
      const instance = new BaseClass()
      expect(() => instance.checkMissingAndThrow({}, { a: 'number' })).toThrow('Missing key: a')
    })

    it('throws when a required key is null', () => {
      const instance = new BaseClass()
      expect(() => instance.checkMissingAndThrow({ a: null }, { a: 'number' })).toThrow('Missing key: a')
    })

    it('throws when a key has the wrong type', () => {
      const instance = new BaseClass()
      expect(() => instance.checkMissingAndThrow({ a: 'not-a-number' }, { a: 'number' })).toThrow(
        'Invalid type for key: a',
      )
    })

    it('does not throw when every key is present with the right type', () => {
      const instance = new BaseClass()
      expect(() => instance.checkMissingAndThrow({ a: 1, b: 'x' }, { a: 'number', b: 'string' })).not.toThrow()
    })
  })

  describe('isValidGetInformations', () => {
    it('coerces primitive properties to booleans', () => {
      const instance = new BaseClass()
      instance.a = 1
      instance.b = ''
      instance.c = 0
      expect(instance.isValidGetInformations()).toEqual({ a: true, b: false, c: false })
    })

    it('recurses into nested BaseClass-like objects', () => {
      const instance = new BaseClass()
      const nested = new BaseClass()
      nested.x = 1
      instance.nested = nested
      expect(instance.isValidGetInformations()).toEqual({ nested: { x: true } })
    })
  })
})
