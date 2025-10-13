// Auto-generated offline stub for next-auth
const createStub = (label) => {
  const stub = function () {
    throw new Error(label + ' is not available in the offline test environment.');
  };
  const proxy = new Proxy(stub, {
    get(target, prop) {
      if (prop === 'default') {
        return proxy;
      }
      return createStub(label + '.' + String(prop));
    }
  });
  return proxy;
};

module.exports = createStub('next-auth');
