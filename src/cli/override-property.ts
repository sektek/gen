/**
 * Test helper: replaces a property on `target` and returns a function that
 * restores the original own property descriptor, or deletes the override when
 * the property was inherited or absent.
 *
 * @param target - The object to modify.
 * @param property - The property name to override.
 * @param value - The temporary value.
 * @returns A function that undoes the override.
 */
export const overrideProperty = (
  target: object,
  property: string,
  value: unknown,
): (() => void) => {
  const descriptor = Object.getOwnPropertyDescriptor(target, property);
  Object.defineProperty(target, property, {
    value,
    configurable: true,
    writable: true,
  });
  return () => {
    if (descriptor) {
      Object.defineProperty(target, property, descriptor);
    } else {
      Reflect.deleteProperty(target, property);
    }
  };
};
