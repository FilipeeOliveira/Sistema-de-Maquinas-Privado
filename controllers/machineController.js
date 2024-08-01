const Machine = require('../models/machine');
const fs = require('fs');
const { Op } = require('sequelize');
const path = require('path');
const MachineLog = require('../models/MachineLog');

exports.searchAndFilterMachines = async (search, status, limit, offset) => {
    try {
        const whereClause = status ? { status } : {};
        const { count, rows: machines } = await Machine.findAndCountAll({
            where: {
                [Op.and]: [
                    whereClause,
                    {
                        [Op.or]: [
                            { name: { [Op.like]: `%${search}%` } },
                            { tags: { [Op.like]: `%${search}%` } }
                        ]
                    }
                ]
            },
            limit,
            offset,
            order: [['createdAt', 'DESC']] // Adicione a ordenação aqui
        });

        return { machines, count };
    } catch (error) {
        console.error('Erro ao buscar e filtrar máquinas:', error);
        throw error;
    }
};

//DEIXEI COMENTADO PARA CASO TENHA UM BUG NO SISTEMA DE MAQUINAS
/* exports.listMachines = async (status) => {
    try {
        const whereClause = status ? { status } : {};
        const machines = await Machine.findAll({
            where: whereClause,
            order: [['createdAt', 'DESC']]
        });
        return machines;
    } catch (err) {
        console.error('Erro ao encontrar as máquinas:', err);
        throw err;
    }
}; */

exports.deleteMachine = async (id) => {
    try {
        const machine = await Machine.findByPk(id);

        if (!machine) {
            throw new Error('Máquina não encontrada');
        }

        // Deletar logs associados à máquina
        await MachineLog.destroy({ where: { machineId: id } });

        // Deletar imagens associadas à máquina
        if (machine.images && machine.images.length > 0) {
            machine.images.forEach(imagePath => {
                const filePath = path.join(__dirname, '../public', imagePath);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                } else {
                    console.warn(`Arquivo não encontrado para remoção: ${filePath}`);
                }
            });
        }

        // Deletar a máquina
        await Machine.destroy({ where: { id } });
    } catch (err) {
        console.error('Erro ao deletar a máquina:', err);
        throw err;
    }
};

exports.getMachineById = async (id) => {
    try {
        const machine = await Machine.findByPk(id);
        if (machine) {
            return machine;
        } else {
            throw new Error('Máquina não encontrada');
        }
    } catch (error) {
        console.error('Erro ao buscar máquina:', error);
        throw error;
    }
};

exports.updateMachine = async (id, updatedData, files, imagesToRemove) => {
    try {
        const machine = await Machine.findByPk(id);
        if (!machine) {
            throw new Error('Máquina não encontrada');
        }

        const previousStatus = machine.status;
        const newStatus = updatedData.status;

        // Registrar a alteração de status, se houver
        if (previousStatus !== newStatus) {
            await MachineLog.create({
                machineId: id,
                previousStatus: previousStatus,
                newStatus: newStatus,
                changeDate: new Date()
            });
        }

        let currentImages = [];
        if (typeof machine.images === 'string') {
            currentImages = machine.images.split(',');
        } else if (Array.isArray(machine.images)) {
            currentImages = machine.images;
        }

        console.log('Imagens atuais:', currentImages);

        if (imagesToRemove && imagesToRemove.length > 0) {
            currentImages = currentImages.filter(image => !imagesToRemove.includes(image));
            console.log('Imagens após remoção:', currentImages);
        }

        const newImages = files ? files.map(file => `/uploads/${file.filename}`) : [];
        const updatedImages = currentImages.concat(newImages).join(',');

        await machine.update({
            ...updatedData,
            images: updatedImages,
            updatedAt: new Date()
        });

        return machine;
    } catch (error) {
        console.error('Erro ao atualizar a máquina:', error);
        throw error;
    }
};

exports.getMachineLogsPage = async (req, res) => {
    try {
        const machineId = req.params.id;
        const logs = await MachineLog.findAll({
            where: { machineId },
            order: [['changeDate', 'DESC']]
        });

       
        res.render('pages/machinesLog', {
            machineId,
            logs,
            title: 'Logs de Máquinas',  
            site_name: 'Geral - Conservação e Limpeza', 
            year: new Date().getFullYear(), 
            version: '1.0'  
        });
    } catch (err) {
        console.error('Erro ao obter logs da máquina:', err);
        res.status(500).send('Erro ao obter logs da máquina');
    }
};

exports.getDashboardStats = async () => {
    try {
        const pendingCount = await Machine.count({ where: { status: 'Em chamado' } });
        const maintenanceCount = await Machine.count({ where: { status: 'Em Manutenção' } });
        const inUseCount = await Machine.count({ where: { status: 'Em Uso' } });
        const inStockCount = await Machine.count({ where: { status: 'Em estoque' } });

        return {
            pendingCount,
            maintenanceCount,
            inUseCount,
            inStockCount,
            totalCount: pendingCount + maintenanceCount + inUseCount + inStockCount
        };
    } catch (err) {
        console.error('Erro ao obter estatísticas das máquinas:', err);
        throw err;
    }
};
