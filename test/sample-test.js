const { expect } = require('chai');

describe('Greeter', function () {
  it('deploys and returns greeting', async function () {
    const Greeter = await ethers.getContractFactory('Greeter');
    const greeter = await Greeter.deploy('Hi');
    await greeter.deployed();
    expect(await greeter.greet()).to.equal('Hi');
  });
});
